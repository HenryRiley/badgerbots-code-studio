import { describe, expect, it } from "vitest";
import { sheepCityCompletedExample } from "@badgerbots/program-model";
import {
  AtomicProgramRuntime,
  ExecutionScopeRegistry,
  compileInstructionGraph,
  type AttributedActionContext,
  type MinecraftRuntimeAdapter,
  type RuntimeScopeAddress,
} from "../src/index.js";

class FakeMinecraftAdapter implements MinecraftRuntimeAdapter {
  readonly actions: string[] = [];
  material: "GOLD_BLOCK" | "OTHER" = "GOLD_BLOCK";
  readMaterialUnderPlayer(context: AttributedActionContext) {
    this.actions.push(`read:${context.sourceNodeId}`);
    return this.material;
  }
  explodeAtEventLocation(context: AttributedActionContext, power: number) {
    this.actions.push(`explode:${context.sourceNodeId}:${power}`);
  }
  setPlayerVerticalVelocity(context: AttributedActionContext, value: number) {
    this.actions.push(`velocity:${context.sourceNodeId}:${value}`);
  }
  setSheepColor(context: AttributedActionContext, color: "RED") {
    this.actions.push(`color:${context.sourceNodeId}:${color}`);
  }
  setSheepSpeedMultiplier(context: AttributedActionContext, multiplier: number) {
    this.actions.push(`speed:${context.sourceNodeId}:${multiplier}`);
  }
  dropItem(context: AttributedActionContext, item: "GOLD_INGOT", quantity: number) {
    this.actions.push(`drop:${context.sourceNodeId}:${item}:${quantity}`);
  }
}

const scope: RuntimeScopeAddress = {
  organizationId: "org-one",
  locationId: "location-one",
  sessionId: "session-one",
  projectId: "sheep-city",
  studentId: "student-one",
  worldId: "world-one",
};

describe("scoped atomic Sheep City runtime", () => {
  it("executes each Sheep City event through an attributed world adapter", () => {
    const adapter = new FakeMinecraftAdapter();
    const runtime = new AtomicProgramRuntime(adapter, new ExecutionScopeRegistry());
    expect(
      runtime.deploy(scope, "version-one", compileInstructionGraph(sheepCityCompletedExample)),
    ).toMatchObject({ ok: true, activeProgramVersionId: "version-one" });
    runtime.execute(scope, { event: "projectile_hit", eventLocation: { x: 1, y: 2, z: 3 } });
    runtime.execute(scope, { event: "player_move", playerId: "player-one" });
    runtime.execute(scope, { event: "sheep_spawn", sheepId: "sheep-one" });
    runtime.execute(scope, { event: "sheep_death", sheepId: "sheep-one" });
    expect(adapter.actions).toEqual([
      "explode:explode-safe:2",
      "read:material-under-player",
      "velocity:bounce-gold:1.2",
      "color:sheep-red:RED",
      "speed:sheep-fast:1.8",
      "drop:drop-gold:GOLD_INGOT:1",
    ]);
  });

  it("retains the last good program when a deployment is invalid", () => {
    const adapter = new FakeMinecraftAdapter();
    const scopes = new ExecutionScopeRegistry();
    const runtime = new AtomicProgramRuntime(adapter, scopes);
    const valid = compileInstructionGraph(sheepCityCompletedExample);
    runtime.deploy(scope, "version-one", valid);
    const invalid = structuredClone(valid);
    invalid.graphVersion = 99 as 2;
    expect(runtime.deploy(scope, "version-bad", invalid)).toEqual({
      ok: false,
      message: "Unsupported instruction graph version.",
      retainedProgramVersionId: "version-one",
    });
    expect(() => runtime.execute(scope, { event: "projectile_hit" })).not.toThrow();
  });

  it("cancels every registered scope resource on Stop or disconnect", () => {
    const adapter = new FakeMinecraftAdapter();
    const scopes = new ExecutionScopeRegistry();
    const runtime = new AtomicProgramRuntime(adapter, scopes);
    runtime.deploy(scope, "version-one", compileInstructionGraph(sheepCityCompletedExample));
    const cancelled: string[] = [];
    scopes.register(
      { ...scope, programVersionId: "version-one" },
      { cancel: () => cancelled.push("timer") },
    );
    scopes.register(
      { ...scope, programVersionId: "version-one" },
      { cancel: () => cancelled.push("entity") },
    );
    runtime.stop(scope);
    expect(cancelled).toEqual(["entity", "timer"]);
    expect(() => runtime.execute(scope, { event: "player_move" })).toThrow("No active program");
  });

  it("continues cancellation after one scoped resource throws", () => {
    const adapter = new FakeMinecraftAdapter();
    const scopes = new ExecutionScopeRegistry();
    const runtime = new AtomicProgramRuntime(adapter, scopes);
    runtime.deploy(scope, "version-one", compileInstructionGraph(sheepCityCompletedExample));
    const cancelled: string[] = [];
    scopes.register(
      { ...scope, programVersionId: "version-one" },
      { cancel: () => cancelled.push("first") },
    );
    scopes.register(
      { ...scope, programVersionId: "version-one" },
      {
        cancel: () => {
          throw new Error("Injected cancellation failure.");
        },
      },
    );
    scopes.register(
      { ...scope, programVersionId: "version-one" },
      { cancel: () => cancelled.push("last") },
    );
    expect(runtime.stop(scope)).toEqual({ cancelledResources: 2, cancellationFailures: 1 });
    expect(cancelled).toEqual(["last", "first"]);
    expect(scopes.activeScopeCount()).toBe(0);
    expect(scopes.registeredResourceCount()).toBe(0);
    expect(runtime.activeProgramCount()).toBe(0);
  });

  it("trips a circuit breaker and stops the scope", () => {
    const adapter = new FakeMinecraftAdapter();
    const runtime = new AtomicProgramRuntime(adapter, new ExecutionScopeRegistry(), {
      maximumHandlers: 8,
      maximumInstructionsPerEvent: 64,
      maximumExplosionsPerEvent: 0,
      maximumItemDropsPerEvent: 16,
      maximumWallClockMs: 25,
    });
    runtime.deploy(scope, "version-one", compileInstructionGraph(sheepCityCompletedExample));
    expect(() => runtime.execute(scope, { event: "projectile_hit" })).toThrow(
      "Runtime circuit breaker explosion_limit",
    );
    expect(() => runtime.execute(scope, { event: "projectile_hit" })).toThrow("No active program");
  });
});
