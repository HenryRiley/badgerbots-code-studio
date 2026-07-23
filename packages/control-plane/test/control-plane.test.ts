import { describe, expect, it } from "vitest";
import { sheepCityCompletedExample } from "@badgerbots/program-model";
import type { InstructorId, OrganizationId } from "@badgerbots/shared-types";
import {
  ControlPlaneError,
  ControlPlaneService,
  HmacSecretHasher,
  MemoryControlPlaneStore,
  type Clock,
  type IdGenerator,
  type InstructorAuthAdmin,
  type SecretGenerator,
} from "../src/index.js";

class TestClock implements Clock {
  constructor(public value = new Date("2026-07-20T15:00:00.000Z")) {}
  now() {
    return new Date(this.value);
  }
}

class TestIds implements IdGenerator {
  private value = 0;
  next(kind: string) {
    return `${kind}-${++this.value}`;
  }
}

class TestSecrets implements SecretGenerator {
  private token = 0;
  accessToken() {
    return `access-token-${++this.token}-with-enough-entropy-for-tests`;
  }
  joinCode() {
    return `CAMP${++this.token}XYZ`;
  }
}

class TestAuth implements InstructorAuthAdmin {
  readonly calls: { email: string; password: string }[] = [];
  createInstructor(input: { email: string; password: string }) {
    this.calls.push(input);
    return Promise.resolve({ authUserId: `auth-${this.calls.length}` });
  }
}

async function fixture() {
  const store = new MemoryControlPlaneStore();
  const auth = new TestAuth();
  const clock = new TestClock();
  const ids = new TestIds();
  const secrets = new TestSecrets();
  const hasher = new HmacSecretHasher("test-only-pepper-that-is-longer-than-thirty-two-characters");
  const bootstrapSecret = "one-time-bootstrap-secret";
  const service = new ControlPlaneService(
    store,
    auth,
    clock,
    ids,
    secrets,
    hasher,
    hasher.digest(bootstrapSecret),
  );
  const owner = await service.bootstrapOwner({
    bootstrapSecret,
    email: "Owner@BadgerBots.example",
    password: "Correct Horse Battery Staple!",
    organizationName: "BadgerBots",
    locationName: "Madison",
    correlationId: "cor-bootstrap",
  });
  return { service, store, auth, clock, owner, bootstrapSecret };
}

async function sessionFixture() {
  const result = await fixture();
  const assistantId = await result.service.provisionAssistant({
    actorInstructorId: result.owner.instructorId,
    organizationId: result.owner.organizationId,
    email: "assistant@badgerbots.example",
    password: "Assistant Password 2026!",
    correlationId: "cor-assistant",
  });
  const created = result.service.createSession({
    actorInstructorId: result.owner.instructorId,
    organizationId: result.owner.organizationId,
    locationId: result.owner.locationId,
    startsOn: "2026-07-20",
    endsOn: "2026-07-24",
    trackId: "grades-3-4",
    assistantInstructorIds: [assistantId],
    correlationId: "cor-session",
  });
  const joined = result.service.joinCamper({
    joinCode: created.joinCode,
    firstName: "Ada",
    lastInitial: "L",
    attemptKey: "classroom-device-01",
    correlationId: "cor-join",
  });
  return { ...result, assistantId, created, joined };
}

describe("Checkpoint 2 control plane", () => {
  it("uses one-time admin bootstrap without persisting a password", async () => {
    const { service, store, auth, bootstrapSecret } = await fixture();
    expect(auth.calls).toHaveLength(1);
    expect(store.state.instructors[0]).not.toHaveProperty("password");
    expect(JSON.stringify(store.state)).not.toContain("Correct Horse Battery Staple!");
    await expect(
      service.bootstrapOwner({
        bootstrapSecret,
        email: "second@example.test",
        password: "Another Password 2026!",
        organizationName: "Other",
        locationName: "Other",
        correlationId: "cor-repeat",
      }),
    ).rejects.toMatchObject({ code: "bootstrap_unavailable" });
  });

  it("joins with only class code, first name, and last initial", async () => {
    const { store, joined } = await sessionFixture();
    expect(store.state.campers).toEqual([
      expect.objectContaining({ id: joined.camperId, firstName: "Ada", lastInitial: "L" }),
    ]);
    expect(store.state.campers[0]).not.toHaveProperty("lastName");
    expect(store.state.sessions[0]?.joinCodeDigest).not.toContain("CAMP");
  });

  it("rate-limits repeated invalid class codes without retaining the raw abuse key", async () => {
    const result = await fixture();
    const created = result.service.createSession({
      actorInstructorId: result.owner.instructorId,
      organizationId: result.owner.organizationId,
      locationId: result.owner.locationId,
      startsOn: "2026-07-20",
      endsOn: "2026-07-24",
      trackId: "grades-3-4",
      correlationId: "cor-session-rate-limit",
    });
    const invalidJoin = () =>
      result.service.joinCamper({
        joinCode: "WRONG123",
        firstName: "Ada",
        lastInitial: "L",
        attemptKey: "private-network-device-identifier",
        correlationId: "cor-invalid-join",
      });
    for (let attempt = 0; attempt < 5; attempt += 1)
      expect(invalidJoin).toThrowError(/class code is not active/);
    expect(() =>
      result.service.joinCamper({
        joinCode: created.joinCode,
        firstName: "Ada",
        lastInitial: "L",
        attemptKey: "private-network-device-identifier",
        correlationId: "cor-blocked-valid-join",
      }),
    ).toThrowError(/Too many class-code attempts/);
    expect(JSON.stringify(result.store.state)).not.toContain("private-network-device-identifier");

    result.clock.value = new Date("2026-07-20T15:16:00.000Z");
    expect(
      result.service.joinCamper({
        joinCode: created.joinCode,
        firstName: "Ada",
        lastInitial: "L",
        attemptKey: "private-network-device-identifier",
        correlationId: "cor-valid-join-after-block",
      }),
    ).toMatchObject({ sessionId: created.session.id });
  });

  it("returns a safe conflict for concurrent camper and instructor edits", async () => {
    const { service, joined, assistantId } = await sessionFixture();
    const camperSave = service.saveProgram({
      actor: { kind: "camper", camperId: joined.camperId, accessToken: joined.accessToken },
      workspaceId: joined.workspaceId,
      baseRevision: 0,
      program: sheepCityCompletedExample,
      clientMutationId: "camper-save-1",
      correlationId: "cor-save-1",
    });
    expect(camperSave.kind).toBe("saved");
    const staleInstructorSave = service.saveProgram({
      actor: { kind: "instructor", instructorId: assistantId },
      workspaceId: joined.workspaceId,
      baseRevision: 0,
      program: sheepCityCompletedExample,
      clientMutationId: "assistant-save-1",
      correlationId: "cor-save-2",
    });
    expect(staleInstructorSave).toMatchObject({
      kind: "revision_conflict",
      expectedRevision: 0,
      actualRevision: 1,
    });
    const retry = service.saveProgram({
      actor: { kind: "instructor", instructorId: assistantId },
      workspaceId: joined.workspaceId,
      baseRevision: 1,
      program: sheepCityCompletedExample,
      clientMutationId: "assistant-save-1",
      correlationId: "cor-save-3",
    });
    expect(retry.kind).toBe("saved");
    const idempotentRetry = service.saveProgram({
      actor: { kind: "instructor", instructorId: assistantId },
      workspaceId: joined.workspaceId,
      baseRevision: 1,
      program: sheepCityCompletedExample,
      clientMutationId: "assistant-save-1",
      correlationId: "cor-save-4",
    });
    expect(idempotentRetry).toEqual(retry);
  });

  it("restores history as a new version without erasing later history", async () => {
    const { service, store, joined } = await sessionFixture();
    const first = service.saveProgram({
      actor: { kind: "camper", camperId: joined.camperId, accessToken: joined.accessToken },
      workspaceId: joined.workspaceId,
      baseRevision: 0,
      program: sheepCityCompletedExample,
      clientMutationId: "save-before-restore",
      correlationId: "cor-save",
    });
    if (first.kind !== "saved") throw new Error("Fixture save conflicted");
    const restored = service.restoreProgram({
      actor: { kind: "camper", camperId: joined.camperId, accessToken: joined.accessToken },
      workspaceId: joined.workspaceId,
      versionId: first.version.id,
      baseRevision: 1,
      clientMutationId: "restore-1",
      correlationId: "cor-restore",
    });
    expect(restored.kind).toBe("saved");
    expect(store.state.versions.map((version) => version.revision)).toEqual([1, 2]);
    expect(store.state.versions[1]?.restoredFromVersionId).toBe(first.version.id);
  });

  it("enforces tenant/session instructor boundaries", async () => {
    const { service, store, joined } = await sessionFixture();
    const outsiderId = "ins-outsider" as InstructorId;
    const outsiderOrg = "org-outsider" as OrganizationId;
    store.state.instructors.push({
      id: outsiderId,
      authUserId: "auth-outsider",
      normalizedEmail: "outsider@example.test",
      displayEmail: "outsider@example.test",
    });
    store.state.memberships.push({
      organizationId: outsiderOrg,
      instructorId: outsiderId,
      role: "owner",
    });
    expect(() =>
      service.saveProgram({
        actor: { kind: "instructor", instructorId: outsiderId },
        workspaceId: joined.workspaceId,
        baseRevision: 0,
        program: sheepCityCompletedExample,
        clientMutationId: "cross-tenant",
        correlationId: "cor-cross-tenant",
      }),
    ).toThrow(ControlPlaneError);
  });

  it("stops camper access the day after camp and preserves a recovery window", async () => {
    const { service, store, clock, joined, created, owner } = await sessionFixture();
    service.saveProgram({
      actor: { kind: "camper", camperId: joined.camperId, accessToken: joined.accessToken },
      workspaceId: joined.workspaceId,
      baseRevision: 0,
      program: sheepCityCompletedExample,
      clientMutationId: "save-before-expiry",
      correlationId: "cor-before-expiry",
    });
    clock.value = new Date("2026-07-25T12:00:00.000Z");
    service.advanceRetention("cor-retention-hide");
    expect(created.session.retentionState).toBe("active");
    expect(store.state.sessions[0]).toMatchObject({
      retentionState: "hidden_recoverable",
      recoverableUntil: "2026-08-03",
    });
    expect(() =>
      service.saveProgram({
        actor: { kind: "camper", camperId: joined.camperId, accessToken: joined.accessToken },
        workspaceId: joined.workspaceId,
        baseRevision: 1,
        program: sheepCityCompletedExample,
        clientMutationId: "save-after-expiry",
        correlationId: "cor-after-expiry",
      }),
    ).toThrowError(/no longer accepts/);
    clock.value = new Date("2026-08-04T12:00:00.000Z");
    service.advanceRetention("cor-retention-queue");
    expect(store.state.sessions[0]?.retentionState).toBe("deletion_queued");
    expect(() =>
      service.purgeSession({
        actorInstructorId: owner.instructorId,
        sessionId: created.session.id,
        finalBackupDeleted: false,
        correlationId: "cor-purge-denied",
      }),
    ).toThrowError(/final-backup deletion/);
    service.purgeSession({
      actorInstructorId: owner.instructorId,
      sessionId: created.session.id,
      finalBackupDeleted: true,
      correlationId: "cor-purge",
    });
    expect(store.state.sessions[0]?.retentionState).toBe("deleted");
    expect(store.state.campers).toHaveLength(0);
    expect(store.state.workspaces).toHaveLength(0);
    expect(store.state.versions).toHaveLength(0);
  });

  it("publishes compact hints without camper names or program content", async () => {
    const { store } = await sessionFixture();
    const serialized = JSON.stringify(store.state.realtimeHints);
    expect(serialized).not.toContain("Ada");
    expect(serialized).not.toContain("schemaVersion");
    expect(store.state.realtimeHints.every((hint) => hint.protocolVersion === 1)).toBe(true);
  });

  it("does not authorize a workspace by a display name or foreign token", async () => {
    const { service, joined } = await sessionFixture();
    expect(() =>
      service.saveProgram({
        actor: {
          kind: "camper",
          camperId: joined.camperId,
          accessToken: "wrong-token",
        },
        workspaceId: joined.workspaceId,
        baseRevision: 0,
        program: sheepCityCompletedExample,
        clientMutationId: "bad-token",
        correlationId: "cor-bad-token",
      }),
    ).toThrowError(/authorization was rejected/);
  });
});
