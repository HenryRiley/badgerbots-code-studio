package org.badgerbots.studio.paper;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;
import org.badgerbots.studio.runtime.Instruction;
import org.badgerbots.studio.runtime.InstructionGraph;

/** Strict decoder for the versioned instruction graph. Unsupported opcodes are rejected. */
final class InstructionGraphJson {
  private InstructionGraphJson() {}

  static InstructionGraph decode(JsonObject value) {
    return new InstructionGraph(
        requiredInt(value, "graphVersion"),
        requiredInt(value, "programSchemaVersion"),
        requiredString(value, "programId"),
        requiredString(value, "projectId"),
        handlers(requiredArray(value, "handlers")));
  }

  private static List<InstructionGraph.Handler> handlers(JsonArray values) {
    if (values.size() > 8) throw new IllegalArgumentException("Instruction graph has too many handlers.");
    List<InstructionGraph.Handler> handlers = new ArrayList<>();
    for (JsonElement value : values) {
      JsonObject handler = value.getAsJsonObject();
      handlers.add(
          new InstructionGraph.Handler(
              requiredString(handler, "sourceNodeId"),
              switch (requiredString(handler, "event")) {
                case "projectile_hit" -> InstructionGraph.EventType.PROJECTILE_HIT;
                case "player_move" -> InstructionGraph.EventType.PLAYER_MOVE;
                case "sheep_spawn" -> InstructionGraph.EventType.SHEEP_SPAWN;
                case "sheep_death" -> InstructionGraph.EventType.SHEEP_DEATH;
                default -> throw new IllegalArgumentException("Unsupported Sheep City event.");
              },
              instructions(requiredArray(handler, "instructions"), 1)));
    }
    return handlers;
  }

  private static List<Instruction> instructions(JsonArray values, int depth) {
    if (depth > 8) throw new IllegalArgumentException("Instruction graph nesting is too deep.");
    if (values.size() > 64) {
      throw new IllegalArgumentException("Instruction graph event exceeds the instruction limit.");
    }
    List<Instruction> instructions = new ArrayList<>();
    for (JsonElement value : values) {
      JsonObject instruction = value.getAsJsonObject();
      String sourceNodeId = requiredString(instruction, "sourceNodeId");
      instructions.add(
          switch (requiredString(instruction, "opcode")) {
            case "explode_at_event_location" ->
                new Instruction.Explode(sourceNodeId, requiredDouble(instruction, "power"));
            case "if" ->
                new Instruction.IfThen(
                    sourceNodeId,
                    condition(requiredObject(instruction, "condition")),
                    instructions(requiredArray(instruction, "then"), depth + 1));
            case "set_vertical_velocity" ->
                new Instruction.SetVerticalVelocity(
                    sourceNodeId, requiredDouble(instruction, "value"));
            case "set_sheep_color" ->
                new Instruction.SetSheepColor(sourceNodeId, requiredString(instruction, "color"));
            case "set_sheep_speed_multiplier" ->
                new Instruction.SetSheepSpeed(
                    sourceNodeId, requiredDouble(instruction, "multiplier"));
            case "drop_item" ->
                new Instruction.DropItem(
                    sourceNodeId,
                    requiredString(instruction, "item"),
                    requiredInt(instruction, "quantity"));
            default -> throw new IllegalArgumentException("Unsupported Sheep City instruction.");
          });
    }
    return instructions;
  }

  private static Instruction.MaterialEquals condition(JsonObject value) {
    if (!"equals".equals(requiredString(value, "opcode"))) {
      throw new IllegalArgumentException("Unsupported Sheep City condition.");
    }
    return new Instruction.MaterialEquals(
        requiredString(value, "sourceNodeId"),
        material(requiredObject(value, "left")),
        material(requiredObject(value, "right")));
  }

  private static Instruction.MaterialExpression material(JsonObject value) {
    String sourceNodeId = requiredString(value, "sourceNodeId");
    return switch (requiredString(value, "opcode")) {
      case "read_material_under_player" -> new Instruction.MaterialUnderPlayer(sourceNodeId);
      case "material_constant" ->
          new Instruction.MaterialConstant(sourceNodeId, requiredString(value, "material"));
      default -> throw new IllegalArgumentException("Unsupported material expression.");
    };
  }

  private static String requiredString(JsonObject value, String name) {
    JsonElement element = value.get(name);
    if (element == null || !element.isJsonPrimitive()) {
      throw new IllegalArgumentException("Instruction graph field " + name + " is required.");
    }
    String result = element.getAsString();
    if (result.isBlank() || result.length() > 200) {
      throw new IllegalArgumentException("Instruction graph field " + name + " is invalid.");
    }
    return result;
  }

  private static int requiredInt(JsonObject value, String name) {
    JsonElement element = value.get(name);
    if (element == null || !element.isJsonPrimitive()) {
      throw new IllegalArgumentException("Instruction graph field " + name + " is required.");
    }
    return element.getAsInt();
  }

  private static double requiredDouble(JsonObject value, String name) {
    JsonElement element = value.get(name);
    if (element == null || !element.isJsonPrimitive()) {
      throw new IllegalArgumentException("Instruction graph field " + name + " is required.");
    }
    double result = element.getAsDouble();
    if (!Double.isFinite(result)) {
      throw new IllegalArgumentException("Instruction graph field " + name + " is invalid.");
    }
    return result;
  }

  private static JsonArray requiredArray(JsonObject value, String name) {
    JsonElement element = value.get(name);
    if (element == null || !element.isJsonArray()) {
      throw new IllegalArgumentException("Instruction graph field " + name + " is required.");
    }
    return element.getAsJsonArray();
  }

  private static JsonObject requiredObject(JsonObject value, String name) {
    JsonElement element = value.get(name);
    if (element == null || !element.isJsonObject()) {
      throw new IllegalArgumentException("Instruction graph field " + name + " is required.");
    }
    return element.getAsJsonObject();
  }
}
