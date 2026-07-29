package org.badgerbots.studio.runtime;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class AtomicProgramRuntime {
  public record DeploymentResult(
      boolean ok, String activeProgramVersionId, String retainedProgramVersionId, String message) {}

  private record ActiveProgram(ScopeKey scope, InstructionGraph graph) {}

  private static final class Budget {
    private int instructions;
    private int explosions;
    private int itemDrops;
    private final long startedAt = System.nanoTime();
  }

  private final GameAdapter adapter;
  private final ExecutionScopeRegistry scopes;
  private final RuntimeLimits limits;
  private final Map<String, ActiveProgram> active = new HashMap<>();

  public AtomicProgramRuntime(GameAdapter adapter, ExecutionScopeRegistry scopes) {
    this(adapter, scopes, RuntimeLimits.sheepCity());
  }

  public AtomicProgramRuntime(
      GameAdapter adapter, ExecutionScopeRegistry scopes, RuntimeLimits limits) {
    this.adapter = adapter;
    this.scopes = scopes;
    this.limits = limits;
  }

  public synchronized DeploymentResult deploy(ScopeKey nextScope, InstructionGraph graph) {
    ActiveProgram previous = active.get(nextScope.activeProgramKey());
    try {
      validateGraph(graph);
      scopes.create(nextScope);
      active.put(nextScope.activeProgramKey(), new ActiveProgram(nextScope, graph));
      if (previous != null) scopes.stop(previous.scope());
      return new DeploymentResult(true, nextScope.programVersionId(), null, "Program activated.");
    } catch (RuntimeException exception) {
      return new DeploymentResult(
          false,
          null,
          previous == null ? null : previous.scope().programVersionId(),
          exception.getMessage());
    }
  }

  public synchronized void stop(ScopeKey address) {
    ActiveProgram current = active.remove(address.activeProgramKey());
    if (current != null) scopes.stop(current.scope());
  }

  public synchronized void stopAll() {
    for (ActiveProgram program : List.copyOf(active.values())) scopes.stop(program.scope());
    active.clear();
  }

  public synchronized int activeProgramCount() {
    return active.size();
  }

  public synchronized int execute(ScopeKey address, GameAdapter.EventContext event) {
    ActiveProgram current = active.get(address.activeProgramKey());
    if (current == null || !scopes.isActive(current.scope())) {
      throw new IllegalStateException("No active program.");
    }
    Budget budget = new Budget();
    try {
      for (InstructionGraph.Handler handler : current.graph().handlers()) {
        if (handler.event() == event.event()) {
          executeInstructions(handler.instructions(), current.scope(), event, budget);
        }
      }
      return budget.instructions;
    } catch (RuntimeCircuitBreakerException exception) {
      stop(current.scope());
      throw exception;
    }
  }

  private void executeInstructions(
      List<Instruction> instructions, ScopeKey scope, GameAdapter.EventContext event, Budget budget) {
    for (Instruction instruction : instructions) {
      budget.instructions++;
      if (budget.instructions > limits.maximumInstructionsPerEvent()) {
        throw breaker("instruction_limit", instruction);
      }
      if (System.nanoTime() - budget.startedAt > limits.maximumWallClockNanos()) {
        throw breaker("wall_clock_limit", instruction);
      }
      GameAdapter.ActionContext context =
          new GameAdapter.ActionContext(scope, instruction.sourceNodeId(), event);
      switch (instruction) {
        case Instruction.Explode explode -> {
          budget.explosions++;
          if (budget.explosions > limits.maximumExplosionsPerEvent()) {
            throw breaker("explosion_limit", instruction);
          }
          adapter.explodeAtHit(context, explode.power());
        }
        case Instruction.IfThen ifThen -> {
          if (evaluate(ifThen.condition(), scope, event)) {
            executeInstructions(ifThen.thenInstructions(), scope, event, budget);
          }
        }
        case Instruction.SetVerticalVelocity velocity ->
            adapter.setPlayerVerticalVelocity(context, velocity.value());
        case Instruction.SetSheepColor color -> adapter.setSheepColor(context, color.color());
        case Instruction.SetSheepSpeed speed ->
            adapter.setSheepSpeedMultiplier(context, speed.multiplier());
        case Instruction.DropItem drop -> {
          budget.itemDrops += drop.quantity();
          if (budget.itemDrops > limits.maximumItemDropsPerEvent()) {
            throw breaker("item_drop_limit", instruction);
          }
          adapter.dropItem(context, drop.material(), drop.quantity());
        }
      }
    }
  }

  private boolean evaluate(
      Instruction.MaterialEquals expression,
      ScopeKey scope,
      GameAdapter.EventContext event) {
    return material(expression.left(), scope, event).equals(material(expression.right(), scope, event));
  }

  private String material(
      Instruction.MaterialExpression expression,
      ScopeKey scope,
      GameAdapter.EventContext event) {
    return switch (expression) {
      case Instruction.MaterialConstant constant -> constant.material();
      case Instruction.MaterialUnderPlayer under ->
          adapter.getMaterialUnderPlayer(
              new GameAdapter.ActionContext(scope, under.sourceNodeId(), event));
    };
  }

  private void validateGraph(InstructionGraph graph) {
    if (graph.graphVersion() != 2 || graph.programSchemaVersion() != 2) {
      throw new IllegalArgumentException("Unsupported instruction graph version.");
    }
    if (!"sheep-city".equals(graph.projectId())) {
      throw new IllegalArgumentException("Instruction graph project was rejected.");
    }
    if (graph.handlers().size() > limits.maximumHandlers()) {
      throw new IllegalArgumentException("Instruction graph has too many handlers.");
    }
    for (InstructionGraph.Handler handler : graph.handlers()) {
      if (count(handler.instructions(), 1) > limits.maximumInstructionsPerEvent()) {
        throw new IllegalArgumentException("Instruction graph event exceeds the instruction limit.");
      }
    }
  }

  private int count(List<Instruction> instructions, int depth) {
    if (depth > 8) throw new IllegalArgumentException("Instruction graph nesting is too deep.");
    int total = 0;
    for (Instruction instruction : instructions) {
      total++;
      if (instruction instanceof Instruction.IfThen ifThen) {
        total += count(ifThen.thenInstructions(), depth + 1);
      }
    }
    return total;
  }

  private static RuntimeCircuitBreakerException breaker(String code, Instruction instruction) {
    return new RuntimeCircuitBreakerException(code, instruction.sourceNodeId());
  }
}
