import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  migrateProgram,
  sheepCityStarterProgram,
  validateProgram,
  type Program,
} from "@badgerbots/program-model";
import type {
  CamperId,
  InstructorId,
  LocationId,
  OrganizationId,
  ProgramAuthor,
  ProgramVersionId,
  RevisionConflict,
  SessionId,
  WorkspaceId,
} from "@badgerbots/shared-types";
import type { MemoryControlPlaneStore } from "./memory-store.js";
import type {
  CampSession,
  Clock,
  HelpRequest,
  HelpRequestState,
  IdGenerator,
  InstructorAuthAdmin,
  InstructorRosterEntry,
  ProgressRecord,
  ProgressState,
  ProgramVersion,
  SecretHasher,
  Workspace,
} from "./types.js";

export class ControlPlaneError extends Error {
  constructor(
    readonly code:
      | "forbidden"
      | "invalid_input"
      | "join_denied"
      | "not_found"
      | "session_expired"
      | "bootstrap_unavailable",
    message: string,
  ) {
    super(message);
  }
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class RandomIdGenerator implements IdGenerator {
  next(kind: string): string {
    void kind;
    return randomUUID();
  }
}

export class HmacSecretHasher implements SecretHasher {
  constructor(private readonly pepper: string) {
    if (pepper.length < 32)
      throw new Error("The control-plane secret pepper must be at least 32 characters.");
  }

  digest(secret: string): string {
    return createHmac("sha256", this.pepper).update(secret).digest("hex");
  }
}

export interface SecretGenerator {
  accessToken(): string;
  joinCode(): string;
}

export class RandomSecretGenerator implements SecretGenerator {
  accessToken(): string {
    return randomBytes(32).toString("base64url");
  }

  joinCode(): string {
    const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    const bytes = randomBytes(8);
    return [...bytes].map((value) => alphabet[value % alphabet.length]).join("");
  }
}

export type ActorCredentials =
  | { kind: "instructor"; instructorId: InstructorId }
  | { kind: "camper"; camperId: CamperId; accessToken: string };

interface SaveResult {
  kind: "saved";
  version: ProgramVersion;
}

export class ControlPlaneService {
  private sequence = 0;
  private readonly joinAttempts = new Map<
    string,
    { windowStartedAt: number; failures: number; blockedUntil?: number }
  >();

  constructor(
    readonly store: MemoryControlPlaneStore,
    private readonly authAdmin: InstructorAuthAdmin,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly secrets: SecretGenerator,
    private readonly hasher: SecretHasher,
    private readonly bootstrapSecretDigest: string,
    private readonly recoveryDays = 10,
  ) {
    if (recoveryDays < 7 || recoveryDays > 14)
      throw new Error("Recovery days must remain between 7 and 14.");
  }

  async bootstrapOwner(input: {
    bootstrapSecret: string;
    email: string;
    password: string;
    organizationName: string;
    locationName: string;
    correlationId: string;
  }) {
    if (!this.secretsMatch(this.hasher.digest(input.bootstrapSecret), this.bootstrapSecretDigest))
      throw new ControlPlaneError("forbidden", "Bootstrap authorization was rejected.");
    if (this.store.state.instructors.length > 0)
      throw new ControlPlaneError(
        "bootstrap_unavailable",
        "Initial owner bootstrap has already been used.",
      );
    if (!/^\S+@\S+\.\S+$/.test(input.email) || input.password.length < 12)
      throw new ControlPlaneError(
        "invalid_input",
        "Use a valid instructor email and a password of at least 12 characters.",
      );
    const auth = await this.authAdmin.createInstructor({
      email: input.email.trim(),
      password: input.password,
    });
    const organizationId = this.ids.next("org") as OrganizationId;
    const locationId = this.ids.next("loc") as LocationId;
    const instructorId = this.ids.next("ins") as InstructorId;
    this.store.state.organizations.push({
      id: organizationId,
      name: input.organizationName.trim(),
    });
    this.store.state.locations.push({
      id: locationId,
      organizationId,
      name: input.locationName.trim(),
    });
    this.store.state.instructors.push({
      id: instructorId,
      authUserId: auth.authUserId,
      normalizedEmail: input.email.trim().toLocaleLowerCase(),
      displayEmail: input.email.trim(),
    });
    this.store.state.memberships.push({ organizationId, instructorId, role: "owner" });
    this.audit(
      organizationId,
      undefined,
      "instructor",
      instructorId,
      "owner.bootstrap",
      instructorId,
      input.correlationId,
    );
    return { organizationId, locationId, instructorId };
  }

  addAssistant(input: {
    actorInstructorId: InstructorId;
    organizationId: OrganizationId;
    assistantInstructorId: InstructorId;
    correlationId: string;
  }) {
    this.requireOrganizationRole(input.organizationId, input.actorInstructorId, "owner");
    const assistant = this.store.state.instructors.find(
      (candidate) => candidate.id === input.assistantInstructorId,
    );
    if (!assistant) throw new ControlPlaneError("not_found", "Instructor was not found.");
    if (
      !this.store.state.memberships.some(
        (membership) =>
          membership.organizationId === input.organizationId &&
          membership.instructorId === input.assistantInstructorId,
      )
    ) {
      this.store.state.memberships.push({
        organizationId: input.organizationId,
        instructorId: input.assistantInstructorId,
        role: "assistant",
      });
    }
    this.audit(
      input.organizationId,
      undefined,
      "instructor",
      input.actorInstructorId,
      "membership.assistant.add",
      input.assistantInstructorId,
      input.correlationId,
    );
  }

  async provisionAssistant(input: {
    actorInstructorId: InstructorId;
    organizationId: OrganizationId;
    email: string;
    password: string;
    correlationId: string;
  }): Promise<InstructorId> {
    this.requireOrganizationRole(input.organizationId, input.actorInstructorId, "owner");
    if (!/^\S+@\S+\.\S+$/.test(input.email) || input.password.length < 12)
      throw new ControlPlaneError(
        "invalid_input",
        "Use a valid assistant email and a password of at least 12 characters.",
      );
    const auth = await this.authAdmin.createInstructor({
      email: input.email,
      password: input.password,
    });
    const instructorId = this.ids.next("ins") as InstructorId;
    this.store.state.instructors.push({
      id: instructorId,
      authUserId: auth.authUserId,
      normalizedEmail: input.email.trim().toLocaleLowerCase(),
      displayEmail: input.email.trim(),
    });
    this.store.state.memberships.push({
      organizationId: input.organizationId,
      instructorId,
      role: "assistant",
    });
    this.audit(
      input.organizationId,
      undefined,
      "instructor",
      input.actorInstructorId,
      "membership.assistant.provision",
      instructorId,
      input.correlationId,
    );
    return instructorId;
  }

  createSession(input: {
    actorInstructorId: InstructorId;
    organizationId: OrganizationId;
    locationId: LocationId;
    startsOn: string;
    endsOn: string;
    trackId: string;
    assistantInstructorIds?: InstructorId[];
    correlationId: string;
  }): { session: CampSession; joinCode: string } {
    this.requireOrganizationRole(input.organizationId, input.actorInstructorId, "owner");
    const location = this.store.state.locations.find(
      (candidate) =>
        candidate.id === input.locationId && candidate.organizationId === input.organizationId,
    );
    if (!location)
      throw new ControlPlaneError("not_found", "Location was not found in this organization.");
    const start = parseDate(input.startsOn);
    const end = parseDate(input.endsOn);
    if (end < start)
      throw new ControlPlaneError(
        "invalid_input",
        "Session end date must not precede its start date.",
      );
    const assistants = [...new Set(input.assistantInstructorIds ?? [])];
    for (const assistantId of assistants)
      this.requireOrganizationRole(input.organizationId, assistantId, "assistant");
    let joinCode = this.secrets.joinCode().toUpperCase();
    while (
      this.store.state.sessions.some(
        (session) => session.joinCodeDigest === this.hasher.digest(joinCode),
      )
    )
      joinCode = this.secrets.joinCode().toUpperCase();
    const today = dateOnly(this.clock.now());
    const retentionState = today < input.startsOn ? "scheduled" : "active";
    const session: CampSession = {
      id: this.ids.next("ses") as SessionId,
      organizationId: input.organizationId,
      locationId: input.locationId,
      ownerInstructorId: input.actorInstructorId,
      assistantInstructorIds: assistants,
      trackId: input.trackId,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      joinCodeDigest: this.hasher.digest(joinCode),
      retentionState,
    };
    this.store.state.sessions.push(session);
    this.audit(
      input.organizationId,
      session.id,
      "instructor",
      input.actorInstructorId,
      "session.create",
      session.id,
      input.correlationId,
    );
    this.hint(session, "roster", session.id);
    return { session: structuredClone(session), joinCode };
  }

  joinCamper(input: {
    joinCode: string;
    firstName: string;
    lastInitial: string;
    attemptKey: string;
    correlationId: string;
  }) {
    const attemptKey = this.hasher.digest(input.attemptKey);
    this.requireJoinAttemptAllowed(attemptKey);
    const digest = this.hasher.digest(input.joinCode.trim().toUpperCase());
    const session = this.store.state.sessions.find(
      (candidate) => candidate.joinCodeDigest === digest,
    );
    if (!session) {
      this.recordFailedJoinAttempt(attemptKey);
      throw new ControlPlaneError("join_denied", "That class code is not active.");
    }
    this.joinAttempts.delete(attemptKey);
    this.refreshRetention(session);
    const today = dateOnly(this.clock.now());
    if (session.retentionState !== "active" || today < session.startsOn || today > session.endsOn)
      throw new ControlPlaneError(
        "session_expired",
        "This camp session is not open for student access.",
      );
    const firstName = input.firstName.trim();
    const lastInitial = input.lastInitial.trim().toLocaleUpperCase();
    if (!/^[\p{L}][\p{L}' -]{0,39}$/u.test(firstName) || !/^\p{L}$/u.test(lastInitial))
      throw new ControlPlaneError(
        "invalid_input",
        "Enter a first name and one-letter last initial.",
      );
    const accessToken = this.secrets.accessToken();
    const camperId = this.ids.next("cam") as CamperId;
    this.store.state.campers.push({
      id: camperId,
      sessionId: session.id,
      firstName,
      lastInitial,
      accessTokenDigest: this.hasher.digest(accessToken),
    });
    const workspace: Workspace = {
      id: this.ids.next("wrk") as WorkspaceId,
      organizationId: session.organizationId,
      sessionId: session.id,
      camperId,
      projectId: "sheep-city",
      revision: 0,
      currentProgram: structuredClone(sheepCityStarterProgram),
    };
    this.store.state.workspaces.push(workspace);
    this.audit(
      session.organizationId,
      session.id,
      "camper",
      camperId,
      "camper.join",
      camperId,
      input.correlationId,
    );
    this.hint(session, "roster", camperId);
    return { camperId, sessionId: session.id, workspaceId: workspace.id, accessToken };
  }

  private requireJoinAttemptAllowed(attemptKey: string): void {
    const now = this.clock.now().getTime();
    const attempt = this.joinAttempts.get(attemptKey);
    if (!attempt) return;
    if (attempt.blockedUntil !== undefined && now < attempt.blockedUntil)
      throw new ControlPlaneError(
        "join_denied",
        "Too many class-code attempts. Wait a few minutes and ask an instructor for help.",
      );
    if (now - attempt.windowStartedAt >= 10 * 60 * 1000) this.joinAttempts.delete(attemptKey);
  }

  private recordFailedJoinAttempt(attemptKey: string): void {
    const now = this.clock.now().getTime();
    const current = this.joinAttempts.get(attemptKey);
    const attempt =
      !current || now - current.windowStartedAt >= 10 * 60 * 1000
        ? { windowStartedAt: now, failures: 0 }
        : current;
    attempt.failures += 1;
    if (attempt.failures >= 5) attempt.blockedUntil = now + 15 * 60 * 1000;
    this.joinAttempts.set(attemptKey, attempt);
  }

  saveProgram(input: {
    actor: ActorCredentials;
    workspaceId: WorkspaceId;
    baseRevision: number;
    program: unknown;
    clientMutationId: string;
    correlationId: string;
  }): SaveResult | RevisionConflict<Program> {
    const workspace = this.requireWorkspace(input.workspaceId);
    const session = this.requireSession(workspace.sessionId);
    const author = this.authorizeWorkspaceActor(input.actor, workspace, session);
    const existing = this.store.state.versions.find(
      (version) =>
        version.workspaceId === workspace.id &&
        version.clientMutationId === input.clientMutationId &&
        sameAuthor(version.author, author),
    );
    if (existing) return { kind: "saved", version: structuredClone(existing) };
    if (input.baseRevision !== workspace.revision) {
      return {
        kind: "revision_conflict",
        expectedRevision: input.baseRevision,
        actualRevision: workspace.revision,
        latest: structuredClone(workspace.currentProgram),
      };
    }
    const program = migrateProgram(input.program);
    const validation = validateProgram(program);
    if (!validation.ok)
      throw new ControlPlaneError(
        "invalid_input",
        `Program validation failed: ${validation.diagnostics[0]?.message ?? "unknown error"}`,
      );
    const version = this.writeVersion(workspace, program, author, input.clientMutationId);
    this.audit(
      session.organizationId,
      session.id,
      author.kind,
      author.kind === "camper" ? author.camperId : author.instructorId,
      "program.save",
      workspace.id,
      input.correlationId,
    );
    this.hint(session, "program", workspace.id);
    return { kind: "saved", version: structuredClone(version) };
  }

  restoreProgram(input: {
    actor: ActorCredentials;
    workspaceId: WorkspaceId;
    versionId: ProgramVersionId;
    baseRevision: number;
    clientMutationId: string;
    correlationId: string;
  }): SaveResult | RevisionConflict<Program> {
    const workspace = this.requireWorkspace(input.workspaceId);
    const session = this.requireSession(workspace.sessionId);
    const author = this.authorizeWorkspaceActor(input.actor, workspace, session);
    if (input.baseRevision !== workspace.revision)
      return {
        kind: "revision_conflict",
        expectedRevision: input.baseRevision,
        actualRevision: workspace.revision,
        latest: structuredClone(workspace.currentProgram),
      };
    const source = this.store.state.versions.find(
      (version) => version.id === input.versionId && version.workspaceId === workspace.id,
    );
    if (!source) throw new ControlPlaneError("not_found", "Program version was not found.");
    const version = this.writeVersion(
      workspace,
      source.program,
      author,
      input.clientMutationId,
      source.id,
    );
    this.audit(
      session.organizationId,
      session.id,
      author.kind,
      actorId(author),
      "program.restore",
      source.id,
      input.correlationId,
    );
    this.hint(session, "program", workspace.id);
    return { kind: "saved", version: structuredClone(version) };
  }

  requestHelp(input: {
    actor: Extract<ActorCredentials, { kind: "camper" }>;
    summary?: string;
    correlationId: string;
  }): HelpRequest {
    const camper = this.requireAuthorizedCamper(input.actor);
    const session = this.requireSession(camper.sessionId);
    this.requireActiveSession(session);
    const summary = input.summary?.trim();
    if (summary !== undefined && summary.length > 240)
      throw new ControlPlaneError(
        "invalid_input",
        "Keep the help request summary to 240 characters or fewer.",
      );
    const existing = this.store.state.helpRequests.find(
      (request) => request.camperId === camper.id && request.state !== "resolved",
    );
    if (existing) return structuredClone(existing);
    const request: HelpRequest = {
      id: this.ids.next("help"),
      sessionId: session.id,
      camperId: camper.id,
      state: "open",
      ...(summary ? { summary } : {}),
      createdAt: this.clock.now().toISOString(),
    };
    this.store.state.helpRequests.push(request);
    this.audit(
      session.organizationId,
      session.id,
      "camper",
      camper.id,
      "help.request",
      request.id,
      input.correlationId,
    );
    this.hint(session, "help", request.id);
    return structuredClone(request);
  }

  updateHelpRequest(input: {
    actorInstructorId: InstructorId;
    helpRequestId: string;
    state: Exclude<HelpRequestState, "open">;
    correlationId: string;
  }): HelpRequest {
    const request = this.store.state.helpRequests.find(
      (candidate) => candidate.id === input.helpRequestId,
    );
    if (!request) throw new ControlPlaneError("not_found", "Help request was not found.");
    const session = this.requireSession(request.sessionId);
    this.requireSessionInstructor(session, input.actorInstructorId, false);
    this.requireActiveSession(session);
    request.state = input.state;
    request.acknowledgedByInstructorId = input.actorInstructorId;
    if (input.state === "resolved") request.resolvedAt = this.clock.now().toISOString();
    else delete request.resolvedAt;
    this.audit(
      session.organizationId,
      session.id,
      "instructor",
      input.actorInstructorId,
      `help.${input.state}`,
      request.id,
      input.correlationId,
    );
    this.hint(session, "help", request.id);
    return structuredClone(request);
  }

  setProgress(input: {
    actorInstructorId: InstructorId;
    sessionId: SessionId;
    camperId: CamperId;
    projectKey: "sheep-city";
    benchmarkKey: string;
    state: ProgressState;
    evidence?: Record<string, string | number | boolean>;
    correlationId: string;
  }): ProgressRecord {
    const session = this.requireSession(input.sessionId);
    this.requireSessionInstructor(session, input.actorInstructorId, false);
    this.requireActiveSession(session);
    const camper = this.store.state.campers.find(
      (candidate) => candidate.id === input.camperId && candidate.sessionId === session.id,
    );
    if (!camper) throw new ControlPlaneError("not_found", "Camper was not found in this session.");
    const benchmarkKey = input.benchmarkKey.trim();
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(benchmarkKey))
      throw new ControlPlaneError(
        "invalid_input",
        "Progress benchmark keys must use 2-64 lowercase letters, numbers, or dashes.",
      );
    let record = this.store.state.progressRecords.find(
      (candidate) =>
        candidate.sessionId === session.id &&
        candidate.camperId === camper.id &&
        candidate.projectKey === input.projectKey &&
        candidate.benchmarkKey === benchmarkKey,
    );
    const values = {
      state: input.state,
      evidence: structuredClone(input.evidence ?? {}),
      decidedByInstructorId: input.actorInstructorId,
      observedAt: this.clock.now().toISOString(),
    };
    if (record) Object.assign(record, values);
    else {
      record = {
        id: this.ids.next("progress"),
        sessionId: session.id,
        camperId: camper.id,
        projectKey: input.projectKey,
        benchmarkKey,
        ...values,
      };
      this.store.state.progressRecords.push(record);
    }
    this.audit(
      session.organizationId,
      session.id,
      "instructor",
      input.actorInstructorId,
      "progress.set",
      record.id,
      input.correlationId,
    );
    this.hint(session, "progress", record.id);
    return structuredClone(record);
  }

  getInstructorRoster(input: {
    actorInstructorId: InstructorId;
    sessionId: SessionId;
  }): InstructorRosterEntry[] {
    const session = this.requireSession(input.sessionId);
    this.requireSessionInstructor(session, input.actorInstructorId, false);
    return this.store.state.campers
      .filter((camper) => camper.sessionId === session.id)
      .map((camper) => {
        const workspace = this.store.state.workspaces.find(
          (candidate) => candidate.sessionId === session.id && candidate.camperId === camper.id,
        );
        if (!workspace) throw new ControlPlaneError("not_found", "Camper workspace was not found.");
        const progress = this.store.state.progressRecords
          .filter(
            (candidate) =>
              candidate.sessionId === session.id &&
              candidate.camperId === camper.id &&
              candidate.projectKey === workspace.projectId,
          )
          .at(-1);
        const help = this.store.state.helpRequests
          .filter((candidate) => candidate.camperId === camper.id)
          .at(-1);
        return {
          camperId: camper.id,
          displayName: `${camper.firstName} ${camper.lastInitial}.`,
          workspaceId: workspace.id,
          workspaceRevision: workspace.revision,
          projectId: workspace.projectId,
          progressState: progress?.state ?? "not_started",
          ...(help && help.state !== "resolved" ? { helpState: help.state } : {}),
        };
      });
  }

  advanceRetention(correlationId: string): SessionId[] {
    const changed: SessionId[] = [];
    for (const session of this.store.state.sessions) {
      const before = session.retentionState;
      this.refreshRetention(session);
      if (session.retentionState !== before) {
        changed.push(session.id);
        this.audit(
          session.organizationId,
          session.id,
          "system",
          undefined,
          `retention.${session.retentionState}`,
          session.id,
          correlationId,
        );
        this.hint(session, "retention", session.id);
      }
    }
    return changed;
  }

  purgeSession(input: {
    actorInstructorId: InstructorId;
    sessionId: SessionId;
    finalBackupDeleted: boolean;
    correlationId: string;
  }) {
    const session = this.requireSession(input.sessionId);
    this.requireSessionInstructor(session, input.actorInstructorId, true);
    this.refreshRetention(session);
    if (session.retentionState !== "deletion_queued" || !input.finalBackupDeleted)
      throw new ControlPlaneError(
        "forbidden",
        "Permanent deletion requires an expired recovery window and confirmed final-backup deletion.",
      );
    const camperIds = new Set(
      this.store.state.campers
        .filter((camper) => camper.sessionId === session.id)
        .map((camper) => camper.id),
    );
    const workspaceIds = new Set(
      this.store.state.workspaces
        .filter((workspace) => workspace.sessionId === session.id)
        .map((workspace) => workspace.id),
    );
    this.store.state.versions = this.store.state.versions.filter(
      (version) => !workspaceIds.has(version.workspaceId),
    );
    this.store.state.progressRecords = this.store.state.progressRecords.filter(
      (record) => record.sessionId !== session.id,
    );
    this.store.state.helpRequests = this.store.state.helpRequests.filter(
      (request) => request.sessionId !== session.id,
    );
    this.store.state.workspaces = this.store.state.workspaces.filter(
      (workspace) => workspace.sessionId !== session.id,
    );
    this.store.state.campers = this.store.state.campers.filter(
      (camper) => !camperIds.has(camper.id),
    );
    session.retentionState = "deleted";
    this.audit(
      session.organizationId,
      session.id,
      "instructor",
      input.actorInstructorId,
      "retention.deleted",
      session.id,
      input.correlationId,
    );
  }

  private refreshRetention(session: CampSession) {
    const today = dateOnly(this.clock.now());
    if (
      session.retentionState === "scheduled" &&
      today >= session.startsOn &&
      today <= session.endsOn
    )
      session.retentionState = "active";
    if (
      (session.retentionState === "scheduled" || session.retentionState === "active") &&
      today > session.endsOn
    ) {
      session.retentionState = "hidden_recoverable";
      session.recoverableUntil = addDays(session.endsOn, this.recoveryDays);
    }
    if (
      session.retentionState === "hidden_recoverable" &&
      session.recoverableUntil !== undefined &&
      today > session.recoverableUntil
    )
      session.retentionState = "deletion_queued";
  }

  private authorizeWorkspaceActor(
    actor: ActorCredentials,
    workspace: Workspace,
    session: CampSession,
  ): ProgramAuthor {
    this.requireActiveSession(session);
    if (actor.kind === "instructor") {
      this.requireSessionInstructor(session, actor.instructorId, false);
      return { kind: "instructor", instructorId: actor.instructorId };
    }
    const camper = this.store.state.campers.find(
      (candidate) => candidate.id === actor.camperId && candidate.sessionId === session.id,
    );
    if (
      !camper ||
      camper.id !== workspace.camperId ||
      !this.secretsMatch(camper.accessTokenDigest, this.hasher.digest(actor.accessToken))
    )
      throw new ControlPlaneError("forbidden", "Camper workspace authorization was rejected.");
    return { kind: "camper", camperId: camper.id };
  }

  private requireAuthorizedCamper(actor: Extract<ActorCredentials, { kind: "camper" }>) {
    const camper = this.store.state.campers.find((candidate) => candidate.id === actor.camperId);
    if (
      !camper ||
      !this.secretsMatch(camper.accessTokenDigest, this.hasher.digest(actor.accessToken))
    )
      throw new ControlPlaneError("forbidden", "Camper authorization was rejected.");
    return camper;
  }

  private requireActiveSession(session: CampSession): void {
    this.refreshRetention(session);
    const today = dateOnly(this.clock.now());
    if (session.retentionState !== "active" || today < session.startsOn || today > session.endsOn)
      throw new ControlPlaneError(
        "session_expired",
        "This session no longer accepts classroom changes.",
      );
  }

  private writeVersion(
    workspace: Workspace,
    program: Program,
    author: ProgramAuthor,
    clientMutationId: string,
    restoredFromVersionId?: ProgramVersionId,
  ): ProgramVersion {
    workspace.revision += 1;
    workspace.currentProgram = structuredClone(program);
    const version: ProgramVersion = {
      id: this.ids.next("ver") as ProgramVersionId,
      workspaceId: workspace.id,
      revision: workspace.revision,
      program: structuredClone(program),
      author,
      clientMutationId,
      createdAt: this.clock.now().toISOString(),
      ...(restoredFromVersionId ? { restoredFromVersionId } : {}),
    };
    this.store.state.versions.push(version);
    return version;
  }

  private requireOrganizationRole(
    organizationId: OrganizationId,
    instructorId: InstructorId,
    role: "owner" | "assistant",
  ) {
    const membership = this.store.state.memberships.find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.instructorId === instructorId &&
        candidate.role === role,
    );
    if (!membership)
      throw new ControlPlaneError("forbidden", `This action requires the ${role} role.`);
    return membership;
  }

  private requireSessionInstructor(
    session: CampSession,
    instructorId: InstructorId,
    ownerOnly: boolean,
  ) {
    const authorized =
      session.ownerInstructorId === instructorId ||
      (!ownerOnly && session.assistantInstructorIds.includes(instructorId));
    if (!authorized)
      throw new ControlPlaneError(
        "forbidden",
        ownerOnly
          ? "This action requires the session owner."
          : "Instructor is not assigned to this session.",
      );
  }

  private requireWorkspace(id: WorkspaceId): Workspace {
    const workspace = this.store.state.workspaces.find((candidate) => candidate.id === id);
    if (!workspace) throw new ControlPlaneError("not_found", "Workspace was not found.");
    return workspace;
  }

  private requireSession(id: SessionId): CampSession {
    const session = this.store.state.sessions.find((candidate) => candidate.id === id);
    if (!session) throw new ControlPlaneError("not_found", "Session was not found.");
    return session;
  }

  private audit(
    organizationId: OrganizationId,
    sessionId: SessionId | undefined,
    actorKind: "system" | "instructor" | "camper",
    actorIdValue: string | undefined,
    action: string,
    targetId: string,
    correlationId: string,
  ) {
    this.store.state.audits.push({
      id: this.ids.next("aud"),
      organizationId,
      ...(sessionId ? { sessionId } : {}),
      actorKind,
      ...(actorIdValue ? { actorId: actorIdValue } : {}),
      action,
      targetId,
      correlationId,
      occurredAt: this.clock.now().toISOString(),
    });
  }

  private hint(
    session: CampSession,
    topic: "roster" | "program" | "progress" | "help" | "runtime" | "retention",
    entityId: string,
  ) {
    this.store.state.realtimeHints.push({
      protocolVersion: 1,
      sequence: ++this.sequence,
      organizationId: session.organizationId,
      sessionId: session.id,
      topic,
      entityId,
      occurredAt: this.clock.now().toISOString(),
    });
  }

  private secretsMatch(left: string, right: string): boolean {
    const leftBytes = Buffer.from(left);
    const rightBytes = Buffer.from(right);
    return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
  }
}

function sameAuthor(left: ProgramAuthor, right: ProgramAuthor): boolean {
  return actorId(left) === actorId(right) && left.kind === right.kind;
}

function actorId(author: ProgramAuthor): string {
  return author.kind === "camper" ? author.camperId : author.instructorId;
}

function parseDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ControlPlaneError("invalid_input", "Dates must use YYYY-MM-DD.");
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) throw new ControlPlaneError("invalid_input", "Date is invalid.");
  return timestamp;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(parseDate(value));
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
}
