package org.badgerbots.studio.runtime;

import java.util.List;

public sealed interface Instruction
    permits Instruction.Explode,
        Instruction.IfThen,
        Instruction.SetVerticalVelocity,
        Instruction.SetSheepColor,
        Instruction.SetSheepSpeed,
        Instruction.DropItem {
  String sourceNodeId();

  record Explode(String sourceNodeId, double power) implements Instruction {}

  record IfThen(String sourceNodeId, MaterialEquals condition, List<Instruction> thenInstructions)
      implements Instruction {
    public IfThen {
      thenInstructions = List.copyOf(thenInstructions);
    }
  }

  record SetVerticalVelocity(String sourceNodeId, double value) implements Instruction {}

  record SetSheepColor(String sourceNodeId, String color) implements Instruction {}

  record SetSheepSpeed(String sourceNodeId, double multiplier) implements Instruction {}

  record DropItem(String sourceNodeId, String material, int quantity) implements Instruction {}

  sealed interface MaterialExpression permits MaterialUnderPlayer, MaterialConstant {
    String sourceNodeId();
  }

  record MaterialUnderPlayer(String sourceNodeId) implements MaterialExpression {}

  record MaterialConstant(String sourceNodeId, String material) implements MaterialExpression {}

  record MaterialEquals(
      String sourceNodeId, MaterialExpression left, MaterialExpression right) {}
}
