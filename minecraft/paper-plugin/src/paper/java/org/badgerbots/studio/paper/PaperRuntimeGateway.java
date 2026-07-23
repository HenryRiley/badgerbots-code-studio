package org.badgerbots.studio.paper;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.badgerbots.studio.runtime.AtomicProgramRuntime;
import org.badgerbots.studio.runtime.GameAdapter;
import org.badgerbots.studio.runtime.InstructionGraph;
import org.badgerbots.studio.runtime.ScopeKey;
import org.bukkit.Location;

/**
 * Narrow Host-to-plugin boundary. The Host must authenticate and validate its signed envelope
 * before calling this gateway; browsers never reach it.
 */
public final class PaperRuntimeGateway {
  private final AtomicProgramRuntime runtime;
  private final Map<UUID, ScopeKey> players = new HashMap<>();
  private final Map<UUID, ScopeKey> sheep = new HashMap<>();

  PaperRuntimeGateway(AtomicProgramRuntime runtime) {
    this.runtime = runtime;
  }

  public synchronized AtomicProgramRuntime.DeploymentResult deploy(
      UUID playerId, ScopeKey scope, InstructionGraph graph) {
    AtomicProgramRuntime.DeploymentResult result = runtime.deploy(scope, graph);
    if (result.ok()) players.put(playerId, scope);
    return result;
  }

  public synchronized void registerSheep(UUID sheepId, ScopeKey scope, Location location) {
    requireWorld(scope, location);
    sheep.put(sheepId, scope);
    runtime.execute(
        scope,
        context(InstructionGraph.EventType.SHEEP_SPAWN, null, sheepId, location));
  }

  public synchronized void projectileHit(UUID playerId, Location location) {
    ScopeKey scope = players.get(playerId);
    if (scope == null) return;
    requireWorld(scope, location);
    runtime.execute(
        scope,
        context(InstructionGraph.EventType.PROJECTILE_HIT, playerId, null, location));
  }

  public synchronized void playerMove(UUID playerId, Location location) {
    ScopeKey scope = players.get(playerId);
    if (scope == null) return;
    requireWorld(scope, location);
    runtime.execute(scope, context(InstructionGraph.EventType.PLAYER_MOVE, playerId, null, location));
  }

  public synchronized void sheepDeath(UUID sheepId, Location location) {
    ScopeKey scope = sheep.remove(sheepId);
    if (scope == null) return;
    requireWorld(scope, location);
    runtime.execute(scope, context(InstructionGraph.EventType.SHEEP_DEATH, null, sheepId, location));
  }

  public synchronized void stopPlayer(UUID playerId) {
    ScopeKey scope = players.remove(playerId);
    if (scope == null) return;
    sheep.entrySet().removeIf(entry -> entry.getValue().activeProgramKey().equals(scope.activeProgramKey()));
    runtime.stop(scope);
  }

  public synchronized void stopWorld(UUID worldId) {
    for (Map.Entry<UUID, ScopeKey> entry : Map.copyOf(players).entrySet()) {
      if (entry.getValue().worldId().equals(worldId.toString())) stopPlayer(entry.getKey());
    }
  }

  private static GameAdapter.EventContext context(
      InstructionGraph.EventType event,
      UUID playerId,
      UUID sheepId,
      Location location) {
    return new GameAdapter.EventContext(
        event,
        playerId == null ? null : playerId.toString(),
        sheepId == null ? null : sheepId.toString(),
        location.getX(),
        location.getY(),
        location.getZ());
  }

  private static void requireWorld(ScopeKey scope, Location location) {
    if (location.getWorld() == null
        || !location.getWorld().getUID().toString().equals(scope.worldId())) {
      throw new IllegalStateException("Paper event was outside the execution scope.");
    }
  }
}
