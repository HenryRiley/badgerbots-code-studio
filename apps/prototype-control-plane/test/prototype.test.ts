import { sheepCityCompletedExample } from "@badgerbots/program-model";
import type { ProgramVersion, StoreState, Workspace } from "@badgerbots/control-plane";
import { describe, expect, it } from "vitest";
import {
  MemoryPrototypePersistence,
  SupabasePrototypePersistence,
  type PrototypeDatabaseClient,
  type PrototypePersistence,
} from "../src/persistence.js";
import { ConnectedPrototype } from "../src/prototype.js";
import { isAllowedPrototypeOrigin, isValidPrototypeToken } from "../src/server.js";

class RecordingPersistence implements PrototypePersistence {
  readonly mode = "supabase" as const;
  initialized = 0;
  joined = 0;
  saved = 0;
  rejectSave = false;

  initialize(state: StoreState): Promise<void> {
    void state;
    this.initialized += 1;
    return Promise.resolve();
  }

  join(state: StoreState): Promise<void> {
    void state;
    this.joined += 1;
    return Promise.resolve();
  }

  save(workspace: Workspace, version: ProgramVersion): Promise<void> {
    void workspace;
    void version;
    this.saved += 1;
    return this.rejectSave
      ? Promise.reject(new Error("durable save unavailable"))
      : Promise.resolve();
  }

  setActiveRuntimeVersion(workspaceId: string, versionId: string | undefined): Promise<void> {
    void workspaceId;
    void versionId;
    return Promise.resolve();
  }

  saveRecovery(token: string, payload: unknown, expiresAt: Date): Promise<void> {
    void token;
    void payload;
    void expiresAt;
    return Promise.resolve();
  }

  loadRecovery(token: string): Promise<unknown> {
    void token;
    return Promise.resolve(undefined);
  }
}

describe("connected local prototype", () => {
  it("joins, saves, signs, deploys, executes, rejects a bad replacement, and stops", async () => {
    const prototype = new ConnectedPrototype();
    const initialized = await prototype.initialize();
    let snapshot = await prototype.join({
      joinCode: initialized.joinCode,
      firstName: "Ada",
      lastInitial: "L",
    });
    expect(snapshot.phase).toBe("student_joined");
    snapshot = await prototype.save(sheepCityCompletedExample, snapshot.workspaceRevision);
    expect(snapshot.workspaceRevision).toBe(1);

    snapshot = await prototype.run();
    const activeVersion = snapshot.activeProgramVersionId;
    expect(snapshot.phase).toBe("program_running");
    expect(snapshot.deliveries.at(-1)).toMatchObject({
      command: "deploy_program",
      status: "accepted",
    });

    prototype.trigger({ event: "projectile_hit" });
    prototype.trigger({ event: "player_move", materialUnderPlayer: "OTHER" });
    prototype.trigger({ event: "player_move", materialUnderPlayer: "GOLD_BLOCK" });
    prototype.trigger({ event: "sheep_spawn" });
    snapshot = prototype.trigger({ event: "sheep_death" });
    expect(snapshot.actions.map((action) => action.description)).toEqual([
      "explodeAt(event.location, 2.0)",
      "player.setVelocityY(1.2)",
      "sheep.setColor(RED)",
      "sheep.setSpeedMultiplier(1.8)",
      "world.dropItem(GOLD_INGOT, 1)",
    ]);

    snapshot = await prototype.attemptRejectedDeployment();
    expect(snapshot.activeProgramVersionId).toBe(activeVersion);
    expect(snapshot.deliveries.at(-1)).toMatchObject({
      command: "deploy_program",
      status: "rejected",
      detail: "deployment_validation_failed",
    });

    snapshot = await prototype.stop();
    expect(snapshot.phase).toBe("stopped");
    expect(snapshot.activeProgramVersionId).toBeUndefined();
    expect(() => prototype.trigger({ event: "projectile_hit" })).toThrow(
      "Deploy a program before firing events.",
    );
  });

  it("preserves the current revision when a stale save conflicts", async () => {
    const prototype = new ConnectedPrototype();
    const initialized = await prototype.initialize();
    await prototype.join({
      joinCode: initialized.joinCode,
      firstName: "Grace",
      lastInitial: "H",
    });
    await prototype.save(sheepCityCompletedExample, 0);
    await expect(prototype.save(sheepCityCompletedExample, 0)).rejects.toThrow(
      "Revision conflict: expected 0, current 1.",
    );
    expect(prototype.snapshot().workspaceRevision).toBe(1);
  });

  it("rolls back an acknowledged local mutation when durable persistence fails", async () => {
    const persistence = new RecordingPersistence();
    const prototype = new ConnectedPrototype(persistence);
    const initialized = await prototype.initialize();
    await prototype.join({
      joinCode: initialized.joinCode,
      firstName: "Katherine",
      lastInitial: "J",
    });
    persistence.rejectSave = true;
    await expect(prototype.save(sheepCityCompletedExample, 0)).rejects.toThrow(
      "durable save unavailable",
    );
    expect(prototype.snapshot()).toMatchObject({
      workspaceRevision: 0,
      persistenceMode: "supabase",
      persistenceState: "error",
    });
    persistence.rejectSave = false;
    await expect(prototype.save(sheepCityCompletedExample, 0)).resolves.toMatchObject({
      workspaceRevision: 1,
      persistenceState: "synced",
    });
    expect(persistence).toMatchObject({ initialized: 1, joined: 1, saved: 2 });
  });

  it("recovers acknowledged workspace state and camper authorization", async () => {
    const persistence = new MemoryPrototypePersistence();
    const prototype = new ConnectedPrototype(persistence);
    const initialized = await prototype.initialize();
    await prototype.join({
      joinCode: initialized.joinCode,
      firstName: "Dorothy",
      lastInitial: "V",
    });
    await prototype.save(sheepCityCompletedExample, 0);
    const token = "r".repeat(43);
    await persistence.saveRecovery(token, prototype.recoveryState(), new Date(Date.now() + 60_000));

    const payload = await persistence.loadRecovery(token);
    const recovered = ConnectedPrototype.recover(payload, persistence);
    expect(recovered.snapshot()).toMatchObject({
      phase: "program_saved",
      studentDisplayName: "Dorothy V.",
      workspaceRevision: 1,
    });
    await expect(recovered.save(sheepCityCompletedExample, 1)).resolves.toMatchObject({
      workspaceRevision: 2,
    });
  });

  it("encrypts Supabase recovery state and uses only a token digest", async () => {
    let storedPayload = "";
    let storedDigest = "";
    const client: PrototypeDatabaseClient = {
      rpc(name, parameters) {
        if (name === "save_prototype_lab_recovery") {
          storedPayload = String(parameters.recovery_encrypted_payload);
          storedDigest = String(parameters.recovery_token_digest);
          return Promise.resolve({ data: null, error: null });
        }
        if (name === "load_prototype_lab_recovery")
          return Promise.resolve({ data: storedPayload, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      from() {
        return {
          upsert: () => Promise.resolve({ data: null, error: null }),
          update: () => ({
            eq: () => Promise.resolve({ data: null, error: null }),
          }),
        };
      },
    };
    const persistence = new SupabasePrototypePersistence(client, Buffer.alloc(32, 7));
    const token = "s".repeat(43);
    const payload = { camper: "Ada", revision: 4 };
    await persistence.saveRecovery(token, payload, new Date(Date.now() + 60_000));
    expect(storedPayload).not.toContain("Ada");
    expect(storedDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(storedDigest).not.toContain(token);
    await expect(persistence.loadRecovery(token)).resolves.toEqual(payload);
  });

  it("restricts the HTTP boundary to approved loopback origins and strong tokens", () => {
    expect(isAllowedPrototypeOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isAllowedPrototypeOrigin("http://localhost:4173")).toBe(true);
    expect(isAllowedPrototypeOrigin("https://example.com")).toBe(false);
    expect(isAllowedPrototypeOrigin(undefined)).toBe(false);
    expect(isValidPrototypeToken("a".repeat(43))).toBe(true);
    expect(isValidPrototypeToken("short")).toBe(false);
    expect(isValidPrototypeToken(undefined)).toBe(false);
  });
});
