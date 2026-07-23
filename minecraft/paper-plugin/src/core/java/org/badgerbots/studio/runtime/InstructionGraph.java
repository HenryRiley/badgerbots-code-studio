package org.badgerbots.studio.runtime;

import java.util.List;

public record InstructionGraph(
    int graphVersion,
    int programSchemaVersion,
    String programId,
    String projectId,
    List<Handler> handlers) {
  public InstructionGraph {
    handlers = List.copyOf(handlers);
  }

  public enum EventType {
    PROJECTILE_HIT,
    PLAYER_MOVE,
    SHEEP_SPAWN,
    SHEEP_DEATH
  }

  public record Handler(String sourceNodeId, EventType event, List<Instruction> instructions) {
    public Handler {
      instructions = List.copyOf(instructions);
    }
  }
}
