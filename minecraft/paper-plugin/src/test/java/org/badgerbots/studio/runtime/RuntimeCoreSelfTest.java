package org.badgerbots.studio.runtime;

import java.util.ArrayList;
import java.util.List;

public final class RuntimeCoreSelfTest {
  private RuntimeCoreSelfTest() {}

  public static void main(String[] args) {
    executesSheepCityAndRetainsLastGood();
    cancelsResourcesInReverseOrder();
    continuesCancellationAfterFailure();
    tripsCircuitBreaker();
    System.out.println("BadgerBots Java runtime core tests passed.");
  }

  private static void executesSheepCityAndRetainsLastGood() {
    RecordingAdapter adapter = new RecordingAdapter();
    ExecutionScopeRegistry scopes = new ExecutionScopeRegistry();
    AtomicProgramRuntime runtime =
        new AtomicProgramRuntime(
            adapter, scopes, new RuntimeLimits(8, 64, 1, 16, 1_000_000_000L));
    ScopeKey scope = scope("version-one");
    AtomicProgramRuntime.DeploymentResult deployed = runtime.deploy(scope, graph());
    assert deployed.ok();
    runtime.execute(
        scope,
        new GameAdapter.EventContext(
            InstructionGraph.EventType.PLAYER_MOVE, "player-one", null, 0, 0, 0));
    assert adapter.actions.equals(List.of("read:material-under", "velocity:bounce:1.2"));

    InstructionGraph invalid =
        new InstructionGraph(99, 2, "program", "sheep-city", List.of());
    AtomicProgramRuntime.DeploymentResult rejected = runtime.deploy(scope("version-bad"), invalid);
    assert !rejected.ok();
    assert "version-one".equals(rejected.retainedProgramVersionId());
    runtime.execute(
        scope,
        new GameAdapter.EventContext(
            InstructionGraph.EventType.PLAYER_MOVE, "player-one", null, 0, 0, 0));
  }

  private static void cancelsResourcesInReverseOrder() {
    RecordingAdapter adapter = new RecordingAdapter();
    ExecutionScopeRegistry scopes = new ExecutionScopeRegistry();
    AtomicProgramRuntime runtime = new AtomicProgramRuntime(adapter, scopes);
    ScopeKey scope = scope("version-one");
    runtime.deploy(scope, graph());
    List<String> cancelled = new ArrayList<>();
    scopes.register(scope, () -> cancelled.add("timer"));
    scopes.register(scope, () -> cancelled.add("entity"));
    runtime.stop(scope);
    assert cancelled.equals(List.of("entity", "timer"));
    try {
      runtime.execute(
          scope,
          new GameAdapter.EventContext(
              InstructionGraph.EventType.PLAYER_MOVE, "player-one", null, 0, 0, 0));
      throw new AssertionError("Stopped program executed.");
    } catch (IllegalStateException expected) {
      assert expected.getMessage().contains("No active program");
    }
  }

  private static void tripsCircuitBreaker() {
    RecordingAdapter adapter = new RecordingAdapter();
    ExecutionScopeRegistry scopes = new ExecutionScopeRegistry();
    RuntimeLimits limits = new RuntimeLimits(8, 64, 0, 16, 1_000_000_000L);
    AtomicProgramRuntime runtime = new AtomicProgramRuntime(adapter, scopes, limits);
    ScopeKey scope = scope("version-one");
    InstructionGraph explosionGraph =
        new InstructionGraph(
            2,
            2,
            "program",
            "sheep-city",
            List.of(
                new InstructionGraph.Handler(
                    "event-hit",
                    InstructionGraph.EventType.PROJECTILE_HIT,
                    List.of(new Instruction.Explode("explode", 2.0)))));
    runtime.deploy(scope, explosionGraph);
    try {
      runtime.execute(
          scope,
          new GameAdapter.EventContext(
              InstructionGraph.EventType.PROJECTILE_HIT, "player-one", null, 1, 2, 3));
      throw new AssertionError("Circuit breaker did not trip.");
    } catch (RuntimeCircuitBreakerException expected) {
      assert "explosion_limit".equals(expected.code());
    }
    assert !scopes.isActive(scope);
  }

  private static void continuesCancellationAfterFailure() {
    ExecutionScopeRegistry scopes = new ExecutionScopeRegistry();
    ScopeKey scope = scope("version-cancellation-failure");
    scopes.create(scope);
    List<String> cancelled = new ArrayList<>();
    scopes.register(scope, () -> cancelled.add("first"));
    scopes.register(
        scope,
        () -> {
          throw new IllegalStateException("Injected cancellation failure.");
        });
    scopes.register(scope, () -> cancelled.add("last"));
    ExecutionScopeRegistry.StopResult result = scopes.stop(scope);
    assert result.cancelledResources() == 2;
    assert result.cancellationFailures() == 1;
    assert cancelled.equals(List.of("last", "first"));
    assert scopes.activeScopeCount() == 0;
    assert scopes.registeredResourceCount() == 0;
  }

  private static ScopeKey scope(String version) {
    return new ScopeKey(
        "org-one",
        "location-one",
        "session-one",
        "sheep-city",
        "student-one",
        version,
        "world-one");
  }

  private static InstructionGraph graph() {
    Instruction.MaterialEquals gold =
        new Instruction.MaterialEquals(
            "equals-gold",
            new Instruction.MaterialUnderPlayer("material-under"),
            new Instruction.MaterialConstant("gold-value", "GOLD_BLOCK"));
    return new InstructionGraph(
        2,
        2,
        "program",
        "sheep-city",
        List.of(
            new InstructionGraph.Handler(
                "event-move",
                InstructionGraph.EventType.PLAYER_MOVE,
                List.of(
                    new Instruction.IfThen(
                        "if-gold",
                        gold,
                        List.of(new Instruction.SetVerticalVelocity("bounce", 1.2)))))));
  }

  private static final class RecordingAdapter implements GameAdapter {
    private final List<String> actions = new ArrayList<>();

    @Override
    public String getMaterialUnderPlayer(ActionContext context) {
      actions.add("read:" + context.sourceNodeId());
      return "GOLD_BLOCK";
    }

    @Override
    public void explodeAtHit(ActionContext context, double power) {
      actions.add("explode:" + context.sourceNodeId() + ':' + power);
    }

    @Override
    public void setPlayerVerticalVelocity(ActionContext context, double value) {
      actions.add("velocity:" + context.sourceNodeId() + ':' + value);
    }

    @Override
    public void setSheepColor(ActionContext context, String color) {
      actions.add("color:" + color);
    }

    @Override
    public void setSheepSpeedMultiplier(ActionContext context, double multiplier) {
      actions.add("speed:" + multiplier);
    }

    @Override
    public void dropItem(ActionContext context, String material, int quantity) {
      actions.add("drop:" + material + ':' + quantity);
    }
  }
}
