import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ControlPlaneService,
  HmacSecretHasher,
  MemoryControlPlaneStore,
  RandomIdGenerator,
  RandomSecretGenerator,
  SystemClock,
  type InstructorAuthAdmin,
} from "@badgerbots/control-plane";
import {
  AtomicProgramRuntime,
  ExecutionScopeRegistry,
  MemoryReplayLedger,
  compileInstructionGraph,
  signRuntimeEnvelope,
  verifyRuntimeEnvelope,
  type AttributedActionContext,
  type MinecraftRuntimeAdapter,
  type RuntimeCommand,
  type RuntimeEventContext,
  type RuntimeScopeAddress,
  type SignedRuntimeEnvelope,
  type UnsignedRuntimeEnvelope,
} from "@badgerbots/runtime-protocol";
import { NodeHmacSha256Authenticator } from "@badgerbots/runtime-protocol/node";
import type {
  CamperId,
  InstructorId,
  LocationId,
  OrganizationId,
  SessionId,
  WorkspaceId,
} from "@badgerbots/shared-types";
import {
  MemoryPrototypePersistence,
  type PrototypePersistence,
  type PrototypePersistenceMode,
} from "./persistence.js";

export type PrototypeEvent = RuntimeEventContext["event"];

export interface PrototypeAction {
  id: string;
  event: PrototypeEvent;
  sourceNodeId: string;
  description: string;
}

export interface DeliveryRecord {
  id: string;
  command: RuntimeCommand["kind"];
  status: "accepted" | "duplicate" | "rejected";
  detail: string;
}

export interface PrototypeSnapshot {
  phase: "session_ready" | "student_joined" | "program_saved" | "program_running" | "stopped";
  sessionId: string;
  workspaceId?: string;
  workspaceRevision: number;
  activeProgramVersionId?: string;
  studentDisplayName?: string;
  worldId?: string;
  actions: PrototypeAction[];
  deliveries: DeliveryRecord[];
  runtimeMode: "headless" | "paper";
  persistenceMode: PrototypePersistenceMode;
  persistenceState: "synced" | "error";
}

interface PrototypeIdentity {
  organizationId: OrganizationId;
  locationId: LocationId;
  instructorId: InstructorId;
  sessionId: SessionId;
  joinCode: string;
}

interface StudentIdentity {
  camperId: CamperId;
  workspaceId: WorkspaceId;
  accessToken: string;
  displayName: string;
}

class PrototypeGameAdapter implements MinecraftRuntimeAdapter {
  materialUnderPlayer: "GOLD_BLOCK" | "OTHER" = "OTHER";
  readonly actions: PrototypeAction[] = [];

  readMaterialUnderPlayer(): "GOLD_BLOCK" | "OTHER" {
    return this.materialUnderPlayer;
  }

  explodeAtEventLocation(context: AttributedActionContext, power: number): void {
    this.record(context, `explodeAt(event.location, ${power.toFixed(1)})`);
  }

  setPlayerVerticalVelocity(context: AttributedActionContext, value: number): void {
    this.record(context, `player.setVelocityY(${value.toFixed(1)})`);
  }

  setSheepColor(context: AttributedActionContext): void {
    this.record(context, "sheep.setColor(RED)");
  }

  setSheepSpeedMultiplier(context: AttributedActionContext, multiplier: number): void {
    this.record(context, `sheep.setSpeedMultiplier(${multiplier.toFixed(1)})`);
  }

  dropItem(context: AttributedActionContext, _item: "GOLD_INGOT", quantity: number): void {
    this.record(context, `world.dropItem(GOLD_INGOT, ${quantity})`);
  }

  private record(context: AttributedActionContext, description: string): void {
    this.actions.push({
      id: randomUUID(),
      event: context.event.event,
      sourceNodeId: context.sourceNodeId,
      description,
    });
    if (this.actions.length > 100) this.actions.shift();
  }
}

interface PaperBridgeResponse {
  commandId: string;
  status: "accepted" | "rejected";
  code?: string;
  activeProgramVersionId?: string;
  message: string;
}

export class PaperFileClient {
  private readonly secret: Buffer;

  constructor(
    private readonly root: string,
    encodedSecret: string,
  ) {
    this.secret = Buffer.from(encodedSecret, "base64url");
    if (this.secret.byteLength < 32)
      throw new Error("Paper bridge secret must contain at least 32 bytes.");
  }

  async deliver(
    envelope: SignedRuntimeEnvelope,
    expectedScope: RuntimeScopeAddress,
  ): Promise<PaperBridgeResponse> {
    const payload = JSON.stringify({
      commandId: envelope.commandId,
      kind: envelope.command.kind,
      scope: expectedScope,
      ...(envelope.command.kind === "deploy_program"
        ? {
            programVersionId: envelope.command.programVersionId,
            ...(envelope.command.expectedActiveVersionId
              ? { expectedActiveVersionId: envelope.command.expectedActiveVersionId }
              : {}),
            graph: envelope.command.graph,
          }
        : {}),
    });
    const inbox = path.join(this.root, "inbox");
    const outbox = path.join(this.root, "outbox");
    await Promise.all([mkdir(inbox, { recursive: true }), mkdir(outbox, { recursive: true })]);
    const filename = `${envelope.commandId}.json`;
    const destination = path.join(inbox, filename);
    const temporary = `${destination}.new`;
    await writeFile(temporary, JSON.stringify({ payload, signature: this.sign(payload) }), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporary, destination);
    const responsePath = path.join(outbox, filename);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        const wrapper = JSON.parse(await readFile(responsePath, "utf8")) as {
          payload: string;
          signature: string;
        };
        if (!this.verify(wrapper.payload, wrapper.signature))
          throw new Error("Paper response signature was rejected.");
        await unlink(responsePath).catch(() => undefined);
        const response = JSON.parse(wrapper.payload) as PaperBridgeResponse;
        if (response.commandId !== envelope.commandId)
          throw new Error("Paper response command identifier did not match.");
        return response;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          (error as NodeJS.ErrnoException).code !== "ENOENT"
        )
          throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Paper did not acknowledge the Host command within 10 seconds.");
  }

  private sign(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }

  private verify(payload: string, signature: string): boolean {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
    return timingSafeEqual(Buffer.from(this.sign(payload), "hex"), Buffer.from(signature, "hex"));
  }
}

class LoopbackHostBridge {
  private readonly cloudReplay = new MemoryReplayLedger();
  private hostSequence = 0;
  private activeProgramVersionId: string | undefined;

  constructor(
    private readonly hostId: string,
    private readonly cloudId: string,
    private readonly authenticator: NodeHmacSha256Authenticator,
    private readonly runtime: AtomicProgramRuntime,
    private readonly paper: PaperFileClient | undefined,
  ) {}

  async receive(
    envelope: SignedRuntimeEnvelope,
    expectedScope: RuntimeScopeAddress,
  ): Promise<SignedRuntimeEnvelope<Extract<RuntimeCommand, { kind: "acknowledgement" }>>> {
    const verification = await verifyRuntimeEnvelope(
      envelope,
      {
        channel: "cloud_to_host",
        recipientId: this.hostId,
        scope: expectedScope,
        now: Date.now(),
      },
      this.authenticator,
      this.cloudReplay,
    );
    if (!verification.ok)
      return this.acknowledge(envelope, "rejected", verification.code, this.activeProgramVersionId);
    if (verification.disposition === "duplicate")
      return this.acknowledge(envelope, "duplicate", undefined, this.activeProgramVersionId);
    if (envelope.command.kind === "deploy_program") {
      if (
        envelope.command.expectedActiveVersionId !== undefined &&
        envelope.command.expectedActiveVersionId !== this.activeProgramVersionId
      )
        return this.acknowledge(
          envelope,
          "rejected",
          "active_version_conflict",
          this.activeProgramVersionId,
        );
      if (this.paper) {
        const result = await this.paper.deliver(envelope, expectedScope);
        if (result.status !== "accepted")
          return this.acknowledge(
            envelope,
            "rejected",
            result.code ?? "paper_rejected",
            result.activeProgramVersionId ?? this.activeProgramVersionId,
          );
        this.activeProgramVersionId = result.activeProgramVersionId;
        return this.acknowledge(envelope, "accepted", undefined, this.activeProgramVersionId);
      }
      const result = this.runtime.deploy(
        envelope.scope,
        envelope.command.programVersionId,
        envelope.command.graph,
      );
      if (!result.ok)
        return this.acknowledge(
          envelope,
          "rejected",
          "deployment_validation_failed",
          result.retainedProgramVersionId,
        );
      this.activeProgramVersionId = result.activeProgramVersionId;
      return this.acknowledge(envelope, "accepted", undefined, this.activeProgramVersionId);
    }
    if (envelope.command.kind === "stop_program") {
      if (this.paper) {
        const result = await this.paper.deliver(envelope, expectedScope);
        if (result.status !== "accepted")
          return this.acknowledge(
            envelope,
            "rejected",
            result.code ?? "paper_rejected",
            this.activeProgramVersionId,
          );
      } else {
        this.runtime.stop(envelope.scope);
      }
      this.activeProgramVersionId = undefined;
      return this.acknowledge(envelope, "accepted");
    }
    return this.acknowledge(
      envelope,
      "rejected",
      "unsupported_prototype_command",
      this.activeProgramVersionId,
    );
  }

  private acknowledge(
    envelope: SignedRuntimeEnvelope,
    status: "accepted" | "duplicate" | "rejected",
    code?: string,
    activeProgramVersionId?: string,
  ) {
    const now = Date.now();
    return signRuntimeEnvelope(
      {
        protocolVersion: 1,
        channel: "host_to_cloud",
        senderId: this.hostId,
        recipientId: this.cloudId,
        commandId: randomUUID(),
        sequence: this.hostSequence++,
        issuedAt: now,
        expiresAt: now + 30_000,
        nonce: randomBytes(16).toString("base64url"),
        scope: envelope.scope,
        command: {
          kind: "acknowledgement",
          acknowledgedCommandId: envelope.commandId,
          status,
          ...(code ? { code } : {}),
          ...(activeProgramVersionId ? { activeProgramVersionId } : {}),
        },
      },
      this.authenticator,
    );
  }
}

export class ConnectedPrototype {
  private readonly store = new MemoryControlPlaneStore();
  private readonly hasher: HmacSecretHasher;
  private readonly service: ControlPlaneService;
  private readonly authenticator: NodeHmacSha256Authenticator;
  private readonly adapter = new PrototypeGameAdapter();
  private readonly runtime = new AtomicProgramRuntime(this.adapter, new ExecutionScopeRegistry());
  private readonly host: LoopbackHostBridge;
  private readonly paper: PaperFileClient | undefined;
  private readonly cloudReplay = new MemoryReplayLedger();
  private readonly deliveries: DeliveryRecord[] = [];
  private readonly cloudId = `prototype-cloud-${randomUUID()}`;
  private readonly hostId = `prototype-host-${randomUUID()}`;
  private cloudSequence = 0;
  private identity: PrototypeIdentity | undefined;
  private student: StudentIdentity | undefined;
  private activeProgramVersionId: string | undefined;
  private phase: PrototypeSnapshot["phase"] = "session_ready";
  private persistenceState: PrototypeSnapshot["persistenceState"] = "synced";

  constructor(
    private readonly persistence: PrototypePersistence = new MemoryPrototypePersistence(),
  ) {
    const pepper = randomBytes(32).toString("base64url");
    const bootstrapSecret = randomBytes(32).toString("base64url");
    this.hasher = new HmacSecretHasher(pepper);
    const authAdmin: InstructorAuthAdmin = {
      createInstructor: () => Promise.resolve({ authUserId: randomUUID() }),
    };
    this.service = new ControlPlaneService(
      this.store,
      authAdmin,
      new SystemClock(),
      new RandomIdGenerator(),
      new RandomSecretGenerator(),
      this.hasher,
      this.hasher.digest(bootstrapSecret),
    );
    this.bootstrapSecret = bootstrapSecret;
    this.authenticator = new NodeHmacSha256Authenticator(randomBytes(32));
    const bridgeDirectory = process.env.BADGERBOTS_PAPER_BRIDGE_DIR;
    const bridgeSecret = process.env.BADGERBOTS_PAPER_BRIDGE_SECRET;
    if ((bridgeDirectory && !bridgeSecret) || (!bridgeDirectory && bridgeSecret))
      throw new Error("Paper bridge directory and secret must be configured together.");
    this.paper =
      bridgeDirectory && bridgeSecret
        ? new PaperFileClient(bridgeDirectory, bridgeSecret)
        : undefined;
    this.host = new LoopbackHostBridge(
      this.hostId,
      this.cloudId,
      this.authenticator,
      this.runtime,
      this.paper,
    );
  }

  private readonly bootstrapSecret: string;

  async initialize(): Promise<{ joinCode: string; snapshot: PrototypeSnapshot }> {
    if (this.identity) return { joinCode: this.identity.joinCode, snapshot: this.snapshot() };
    const today = new Date().toISOString().slice(0, 10);
    const bootstrapped = await this.service.bootstrapOwner({
      bootstrapSecret: this.bootstrapSecret,
      email: `prototype-${randomUUID()}@invalid.example`,
      password: randomBytes(24).toString("base64url"),
      organizationName: "BadgerBots Local Prototype",
      locationName: "Loopback Lab",
      correlationId: randomUUID(),
    });
    const created = this.service.createSession({
      actorInstructorId: bootstrapped.instructorId,
      organizationId: bootstrapped.organizationId,
      locationId: bootstrapped.locationId,
      startsOn: today,
      endsOn: today,
      trackId: "grades-3-4",
      correlationId: randomUUID(),
    });
    this.identity = {
      ...bootstrapped,
      sessionId: created.session.id,
      joinCode: created.joinCode,
    };
    await this.persistence.initialize(this.store.state);
    return { joinCode: created.joinCode, snapshot: this.snapshot() };
  }

  async join(input: {
    joinCode: string;
    firstName: string;
    lastInitial: string;
  }): Promise<PrototypeSnapshot> {
    this.requireIdentity();
    if (this.student) throw new Error("This local lab already has a student.");
    const before = structuredClone(this.store.state);
    const joined = this.service.joinCamper({
      ...input,
      attemptKey: `loopback-${randomUUID()}`,
      correlationId: randomUUID(),
    });
    this.student = {
      camperId: joined.camperId,
      workspaceId: joined.workspaceId,
      accessToken: joined.accessToken,
      displayName: `${input.firstName.trim()} ${input.lastInitial.trim().toUpperCase()}.`,
    };
    this.phase = "student_joined";
    try {
      await this.persistence.join(this.store.state);
      this.persistenceState = "synced";
    } catch (error) {
      this.restoreState(before);
      this.student = undefined;
      this.phase = "session_ready";
      this.persistenceState = "error";
      throw error;
    }
    return this.snapshot();
  }

  async save(program: unknown, baseRevision: number): Promise<PrototypeSnapshot> {
    const student = this.requireStudent();
    const before = structuredClone(this.store.state);
    const previousPhase = this.phase;
    const result = this.service.saveProgram({
      actor: {
        kind: "camper",
        camperId: student.camperId,
        accessToken: student.accessToken,
      },
      workspaceId: student.workspaceId,
      baseRevision,
      program,
      clientMutationId: randomUUID(),
      correlationId: randomUUID(),
    });
    if (result.kind === "revision_conflict")
      throw new Error(
        `Revision conflict: expected ${result.expectedRevision}, current ${result.actualRevision}.`,
      );
    const workspace = this.workspace();
    try {
      await this.persistence.save(workspace, result.version);
      this.persistenceState = "synced";
    } catch (error) {
      this.restoreState(before);
      this.phase = previousPhase;
      this.persistenceState = "error";
      throw error;
    }
    this.phase = "program_saved";
    return this.snapshot();
  }

  async run(): Promise<PrototypeSnapshot> {
    const student = this.requireStudent();
    const workspace = this.workspace();
    if (workspace.revision < 1) throw new Error("Save a valid program before deploying it.");
    const version = this.store.state.versions
      .filter((candidate) => candidate.workspaceId === student.workspaceId)
      .at(-1);
    if (!version) throw new Error("The saved program version could not be found.");
    const command: RuntimeCommand = {
      kind: "deploy_program",
      programVersionId: version.id,
      ...(this.activeProgramVersionId
        ? { expectedActiveVersionId: this.activeProgramVersionId }
        : {}),
      graph: compileInstructionGraph(workspace.currentProgram),
    };
    const acknowledgement = await this.deliver(command);
    if (acknowledgement.command.status !== "accepted")
      throw new Error(
        `Host rejected deployment: ${acknowledgement.command.code ?? "unknown reason"}.`,
      );
    this.activeProgramVersionId = acknowledgement.command.activeProgramVersionId;
    this.phase = "program_running";
    await this.updatePersistedRuntimeVersion(this.activeProgramVersionId);
    return this.snapshot();
  }

  async attemptRejectedDeployment(): Promise<PrototypeSnapshot> {
    const workspace = this.workspace();
    const valid = compileInstructionGraph(workspace.currentProgram);
    const command: RuntimeCommand = {
      kind: "deploy_program",
      programVersionId: `rejected-${randomUUID()}`,
      ...(this.activeProgramVersionId
        ? { expectedActiveVersionId: this.activeProgramVersionId }
        : {}),
      graph: {
        ...valid,
        handlers: Array.from({ length: 9 }, (_, index) => ({
          sourceNodeId: `over-limit-${index}`,
          event: "player_move" as const,
          instructions: [],
        })),
      },
    };
    const acknowledgement = await this.deliver(command);
    if (acknowledgement.command.status !== "rejected")
      throw new Error("The intentionally invalid deployment was not rejected.");
    if (acknowledgement.command.activeProgramVersionId !== this.activeProgramVersionId)
      throw new Error("The Host did not retain the last known-good program.");
    return this.snapshot();
  }

  trigger(input: {
    event: PrototypeEvent;
    materialUnderPlayer?: "GOLD_BLOCK" | "OTHER";
  }): PrototypeSnapshot {
    if (this.paper)
      throw new Error("Paper mode uses real Minecraft events. Test the behavior inside Minecraft.");
    if (!this.activeProgramVersionId) throw new Error("Deploy a program before firing events.");
    this.adapter.materialUnderPlayer = input.materialUnderPlayer ?? "OTHER";
    this.runtime.execute(this.scope(), {
      event: input.event,
      eventLocation: { x: 0, y: 64, z: 0 },
      playerId: "prototype-player",
      sheepId: "prototype-sheep",
    });
    return this.snapshot();
  }

  async stop(): Promise<PrototypeSnapshot> {
    if (!this.activeProgramVersionId) return this.snapshot();
    const acknowledgement = await this.deliver({
      kind: "stop_program",
      reason: "student",
    });
    if (acknowledgement.command.status !== "accepted")
      throw new Error("The Host rejected the stop request.");
    this.activeProgramVersionId = undefined;
    this.phase = "stopped";
    await this.updatePersistedRuntimeVersion(undefined);
    return this.snapshot();
  }

  snapshot(): PrototypeSnapshot {
    const workspace = this.student ? this.workspace() : undefined;
    return {
      phase: this.phase,
      sessionId: this.identity?.sessionId ?? "initializing",
      ...(workspace ? { workspaceId: workspace.id } : {}),
      workspaceRevision: workspace?.revision ?? 0,
      ...(this.activeProgramVersionId
        ? { activeProgramVersionId: this.activeProgramVersionId }
        : {}),
      ...(this.student ? { studentDisplayName: this.student.displayName } : {}),
      ...(this.student ? { worldId: this.scope().worldId } : {}),
      actions: structuredClone(this.adapter.actions),
      deliveries: structuredClone(this.deliveries),
      runtimeMode: this.paper ? "paper" : "headless",
      persistenceMode: this.persistence.mode,
      persistenceState: this.persistenceState,
    };
  }

  private async deliver(command: RuntimeCommand) {
    const scope = this.scope();
    const now = Date.now();
    const envelope = await signRuntimeEnvelope(
      {
        protocolVersion: 1,
        channel: "cloud_to_host",
        senderId: this.cloudId,
        recipientId: this.hostId,
        commandId: randomUUID(),
        sequence: this.cloudSequence++,
        issuedAt: now,
        expiresAt: now + 30_000,
        nonce: randomBytes(16).toString("base64url"),
        scope,
        command,
      } satisfies UnsignedRuntimeEnvelope,
      this.authenticator,
    );
    const acknowledgement = await this.host.receive(envelope, scope);
    const verified = await verifyRuntimeEnvelope(
      acknowledgement,
      {
        channel: "host_to_cloud",
        recipientId: this.cloudId,
        scope,
        now: Date.now(),
      },
      this.authenticator,
      this.cloudReplay,
    );
    if (!verified.ok) throw new Error(`Host acknowledgement failed: ${verified.code}.`);
    this.deliveries.push({
      id: acknowledgement.commandId,
      command: command.kind,
      status: acknowledgement.command.status,
      detail:
        acknowledgement.command.code ??
        (acknowledgement.command.activeProgramVersionId
          ? `active ${acknowledgement.command.activeProgramVersionId}`
          : "scope stopped"),
    });
    if (this.deliveries.length > 50) this.deliveries.shift();
    return acknowledgement;
  }

  private scope(): RuntimeScopeAddress {
    const identity = this.requireIdentity();
    const student = this.requireStudent();
    return {
      organizationId: identity.organizationId,
      locationId: identity.locationId,
      sessionId: identity.sessionId,
      projectId: "sheep-city",
      studentId: student.camperId,
      worldId: `prototype-world-${student.camperId}`,
    };
  }

  private workspace() {
    const student = this.requireStudent();
    const workspace = this.store.state.workspaces.find(
      (candidate) => candidate.id === student.workspaceId,
    );
    if (!workspace) throw new Error("Prototype workspace was not found.");
    return workspace;
  }

  private async updatePersistedRuntimeVersion(versionId: string | undefined): Promise<void> {
    try {
      await this.persistence.setActiveRuntimeVersion(this.requireStudent().workspaceId, versionId);
      this.persistenceState = "synced";
    } catch {
      this.persistenceState = "error";
    }
  }

  private restoreState(before: MemoryControlPlaneStore["state"]): void {
    this.store.state.organizations.splice(0, Infinity, ...before.organizations);
    this.store.state.locations.splice(0, Infinity, ...before.locations);
    this.store.state.instructors.splice(0, Infinity, ...before.instructors);
    this.store.state.memberships.splice(0, Infinity, ...before.memberships);
    this.store.state.sessions.splice(0, Infinity, ...before.sessions);
    this.store.state.campers.splice(0, Infinity, ...before.campers);
    this.store.state.workspaces.splice(0, Infinity, ...before.workspaces);
    this.store.state.versions.splice(0, Infinity, ...before.versions);
    this.store.state.progressRecords.splice(0, Infinity, ...before.progressRecords);
    this.store.state.helpRequests.splice(0, Infinity, ...before.helpRequests);
    this.store.state.audits.splice(0, Infinity, ...before.audits);
    this.store.state.realtimeHints.splice(0, Infinity, ...before.realtimeHints);
  }

  private requireIdentity(): PrototypeIdentity {
    if (!this.identity) throw new Error("Initialize the local lab first.");
    return this.identity;
  }

  private requireStudent(): StudentIdentity {
    if (!this.student) throw new Error("Join the local session first.");
    return this.student;
  }
}
