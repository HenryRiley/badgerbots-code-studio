package org.badgerbots.studio.runtime;

public interface GameAdapter {
  record EventContext(
      InstructionGraph.EventType event,
      String playerId,
      String sheepId,
      double x,
      double y,
      double z) {}

  record ActionContext(ScopeKey scope, String sourceNodeId, EventContext event) {}

  String getMaterialUnderPlayer(ActionContext context);

  void explodeAtHit(ActionContext context, double power);

  void setPlayerVerticalVelocity(ActionContext context, double value);

  void setSheepColor(ActionContext context, String color);

  void setSheepSpeedMultiplier(ActionContext context, double multiplier);

  void dropItem(ActionContext context, String material, int quantity);
}
