import type {
  InstructionGraphV2,
  RuntimeBooleanExpression,
  RuntimeHandler,
  RuntimeInstruction,
  RuntimeMaterialExpression,
} from "./instruction-graph.js";
import type { RuntimeScopeAddress } from "./envelope.js";

export interface ExecutionScopeKey extends RuntimeScopeAddress {
  programVersionId: string;
}

export interface ScopedResource {
  cancel(): void;
}

interface ScopeState {
  stopped: boolean;
  resources: Set<ScopedResource>;
}

function scopeKey(key: ExecutionScopeKey): string {
  return [
    key.organizationId,
    key.locationId,
    key.sessionId,
    key.projectId,
    key.studentId,
    key.programVersionId,
    key.worldId,
  ].join("\u001f");
}

export class ExecutionScopeRegistry {
  private readonly scopes = new Map<string, ScopeState>();

  create(key: ExecutionScopeKey): void {
    const id = scopeKey(key);
    if (this.scopes.has(id)) throw new Error("Execution scope already exists.");
    this.scopes.set(id, { stopped: false, resources: new Set() });
  }

  register(key: ExecutionScopeKey, resource: ScopedResource): void {
    const state = this.scopes.get(scopeKey(key));
    if (!state || state.stopped) {
      resource.cancel();
      throw new Error("Execution scope is not active.");
    }
    state.resources.add(resource);
  }

  stop(key: ExecutionScopeKey): void {
    const id = scopeKey(key);
    const state = this.scopes.get(id);
    if (!state) return;
    state.stopped = true;
    for (const resource of [...state.resources].reverse()) resource.cancel();
    state.resources.clear();
    this.scopes.delete(id);
  }

  isActive(key: ExecutionScopeKey): boolean {
    return this.scopes.has(scopeKey(key));
  }
}

export interface RuntimeEventContext {
  event: RuntimeHandler["event"];
  eventLocation?: { x: number; y: number; z: number };
  playerId?: string;
  sheepId?: string;
}

export interface AttributedActionContext {
  scope: ExecutionScopeKey;
  sourceNodeId: string;
  event: RuntimeEventContext;
}

export interface MinecraftRuntimeAdapter {
  readMaterialUnderPlayer(context: AttributedActionContext): "GOLD_BLOCK" | "OTHER";
  explodeAtEventLocation(context: AttributedActionContext, power: number): void;
  setPlayerVerticalVelocity(context: AttributedActionContext, value: number): void;
  setSheepColor(context: AttributedActionContext, color: "RED"): void;
  setSheepSpeedMultiplier(context: AttributedActionContext, multiplier: number): void;
  dropItem(context: AttributedActionContext, item: "GOLD_INGOT", quantity: number): void;
}

export interface RuntimeLimits {
  maximumHandlers: number;
  maximumInstructionsPerEvent: number;
  maximumExplosionsPerEvent: number;
  maximumItemDropsPerEvent: number;
  maximumWallClockMs: number;
}

export const SHEEP_CITY_RUNTIME_LIMITS: RuntimeLimits = {
  maximumHandlers: 8,
  maximumInstructionsPerEvent: 64,
  maximumExplosionsPerEvent: 1,
  maximumItemDropsPerEvent: 16,
  maximumWallClockMs: 25,
};

interface EventBudget {
  instructions: number;
  explosions: number;
  itemDrops: number;
  startedAt: number;
}

export class RuntimeCircuitBreakerError extends Error {
  constructor(
    readonly code: "instruction_limit" | "explosion_limit" | "item_drop_limit" | "wall_clock_limit",
    readonly sourceNodeId: string,
  ) {
    super(`Runtime circuit breaker ${code} at ${sourceNodeId}.`);
  }
}

function assertGraph(graph: InstructionGraphV2, limits: RuntimeLimits): void {
  if (graph.graphVersion !== 2 || graph.programSchemaVersion !== 2)
    throw new Error("Unsupported instruction graph version.");
  if (graph.projectId !== "sheep-city") throw new Error("Instruction graph project was rejected.");
  if (graph.handlers.length > limits.maximumHandlers)
    throw new Error("Instruction graph has too many handlers.");
  const countInstructions = (instructions: RuntimeInstruction[], depth: number): number => {
    if (depth > 8) throw new Error("Instruction graph nesting is too deep.");
    return instructions.reduce(
      (total, instruction) =>
        total +
        1 +
        (instruction.opcode === "if" ? countInstructions(instruction.then, depth + 1) : 0),
      0,
    );
  };
  for (const handler of graph.handlers)
    if (countInstructions(handler.instructions, 1) > limits.maximumInstructionsPerEvent)
      throw new Error("Instruction graph event exceeds the instruction limit.");
}

interface ActiveProgram {
  scope: ExecutionScopeKey;
  graph: InstructionGraphV2;
}

function activeKey(scope: RuntimeScopeAddress): string {
  return [
    scope.organizationId,
    scope.locationId,
    scope.sessionId,
    scope.projectId,
    scope.studentId,
    scope.worldId,
  ].join("\u001f");
}

export type DeploymentResult =
  | { ok: true; activeProgramVersionId: string; replacedProgramVersionId?: string }
  | { ok: false; message: string; retainedProgramVersionId?: string };

export class AtomicProgramRuntime {
  private readonly active = new Map<string, ActiveProgram>();

  constructor(
    private readonly adapter: MinecraftRuntimeAdapter,
    private readonly scopes: ExecutionScopeRegistry,
    private readonly limits = SHEEP_CITY_RUNTIME_LIMITS,
    private readonly now: () => number = () => performance.now(),
  ) {}

  deploy(
    scope: RuntimeScopeAddress,
    programVersionId: string,
    graph: InstructionGraphV2,
  ): DeploymentResult {
    const key = activeKey(scope);
    const previous = this.active.get(key);
    try {
      assertGraph(graph, this.limits);
      const nextScope = { ...scope, programVersionId };
      this.scopes.create(nextScope);
      this.active.set(key, { scope: nextScope, graph: structuredClone(graph) });
      if (previous) this.scopes.stop(previous.scope);
      return {
        ok: true,
        activeProgramVersionId: programVersionId,
        ...(previous ? { replacedProgramVersionId: previous.scope.programVersionId } : {}),
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Program deployment failed.",
        ...(previous ? { retainedProgramVersionId: previous.scope.programVersionId } : {}),
      };
    }
  }

  stop(scope: RuntimeScopeAddress): void {
    const key = activeKey(scope);
    const active = this.active.get(key);
    if (!active) return;
    this.scopes.stop(active.scope);
    this.active.delete(key);
  }

  execute(scope: RuntimeScopeAddress, event: RuntimeEventContext): { instructions: number } {
    const active = this.active.get(activeKey(scope));
    if (!active || !this.scopes.isActive(active.scope)) throw new Error("No active program.");
    const budget: EventBudget = {
      instructions: 0,
      explosions: 0,
      itemDrops: 0,
      startedAt: this.now(),
    };
    try {
      for (const handler of active.graph.handlers)
        if (handler.event === event.event)
          this.executeInstructions(handler.instructions, active.scope, event, budget);
      return { instructions: budget.instructions };
    } catch (error) {
      if (error instanceof RuntimeCircuitBreakerError) this.stop(scope);
      throw error;
    }
  }

  private executeInstructions(
    instructions: RuntimeInstruction[],
    scope: ExecutionScopeKey,
    event: RuntimeEventContext,
    budget: EventBudget,
  ): void {
    for (const instruction of instructions) {
      budget.instructions += 1;
      if (budget.instructions > this.limits.maximumInstructionsPerEvent)
        throw new RuntimeCircuitBreakerError("instruction_limit", instruction.sourceNodeId);
      if (this.now() - budget.startedAt > this.limits.maximumWallClockMs)
        throw new RuntimeCircuitBreakerError("wall_clock_limit", instruction.sourceNodeId);
      const context = { scope, sourceNodeId: instruction.sourceNodeId, event };
      switch (instruction.opcode) {
        case "explode_at_event_location":
          budget.explosions += 1;
          if (budget.explosions > this.limits.maximumExplosionsPerEvent)
            throw new RuntimeCircuitBreakerError("explosion_limit", instruction.sourceNodeId);
          this.adapter.explodeAtEventLocation(context, instruction.power);
          break;
        case "if":
          if (this.evaluateBoolean(instruction.condition, scope, event))
            this.executeInstructions(instruction.then, scope, event, budget);
          break;
        case "set_vertical_velocity":
          this.adapter.setPlayerVerticalVelocity(context, instruction.value);
          break;
        case "set_sheep_color":
          this.adapter.setSheepColor(context, instruction.color);
          break;
        case "set_sheep_speed_multiplier":
          this.adapter.setSheepSpeedMultiplier(context, instruction.multiplier);
          break;
        case "drop_item":
          budget.itemDrops += instruction.quantity;
          if (budget.itemDrops > this.limits.maximumItemDropsPerEvent)
            throw new RuntimeCircuitBreakerError("item_drop_limit", instruction.sourceNodeId);
          this.adapter.dropItem(context, instruction.item, instruction.quantity);
          break;
      }
    }
  }

  private evaluateBoolean(
    expression: RuntimeBooleanExpression,
    scope: ExecutionScopeKey,
    event: RuntimeEventContext,
  ): boolean {
    return (
      this.evaluateMaterial(expression.left, scope, event) ===
      this.evaluateMaterial(expression.right, scope, event)
    );
  }

  private evaluateMaterial(
    expression: RuntimeMaterialExpression,
    scope: ExecutionScopeKey,
    event: RuntimeEventContext,
  ): "GOLD_BLOCK" | "OTHER" {
    if (expression.opcode === "material_constant") return expression.material;
    return this.adapter.readMaterialUnderPlayer({
      scope,
      sourceNodeId: expression.sourceNodeId,
      event,
    });
  }
}
