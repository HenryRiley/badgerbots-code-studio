import {
  normalizeProgram,
  validateProgram,
  type BooleanExpressionNode,
  type EventNode,
  type MaterialExpressionNode,
  type Program,
  type StatementNode,
} from "@badgerbots/program-model";

export interface InstructionBase {
  sourceNodeId: string;
  opcode: string;
}

export type RuntimeMaterialExpression =
  | (InstructionBase & { opcode: "read_material_under_player" })
  | (InstructionBase & { opcode: "material_constant"; material: "GOLD_BLOCK" });

export type RuntimeBooleanExpression = InstructionBase & {
  opcode: "equals";
  left: RuntimeMaterialExpression;
  right: RuntimeMaterialExpression;
};

export type RuntimeInstruction =
  | (InstructionBase & { opcode: "explode_at_event_location"; power: number })
  | (InstructionBase & {
      opcode: "if";
      condition: RuntimeBooleanExpression;
      then: RuntimeInstruction[];
    })
  | (InstructionBase & { opcode: "set_vertical_velocity"; value: number })
  | (InstructionBase & { opcode: "set_sheep_color"; color: "RED" })
  | (InstructionBase & { opcode: "set_sheep_speed_multiplier"; multiplier: number })
  | (InstructionBase & { opcode: "drop_item"; item: "GOLD_INGOT"; quantity: number });

export interface RuntimeHandler {
  sourceNodeId: string;
  event: "projectile_hit" | "player_move" | "sheep_spawn" | "sheep_death";
  instructions: RuntimeInstruction[];
}

export interface InstructionGraphV2 {
  graphVersion: 2;
  programSchemaVersion: 2;
  programId: string;
  projectId: "sheep-city";
  handlers: RuntimeHandler[];
}

function compileMaterialExpression(expression: MaterialExpressionNode): RuntimeMaterialExpression {
  switch (expression.nodeType) {
    case "get_material_under_player":
      return { sourceNodeId: expression.id, opcode: "read_material_under_player" };
    case "material_literal":
      return {
        sourceNodeId: expression.id,
        opcode: "material_constant",
        material: expression.material,
      };
  }
}

function compileBooleanExpression(expression: BooleanExpressionNode): RuntimeBooleanExpression {
  return {
    sourceNodeId: expression.id,
    opcode: "equals",
    left: compileMaterialExpression(expression.left),
    right: compileMaterialExpression(expression.right),
  };
}

function compileStatement(statement: StatementNode): RuntimeInstruction {
  switch (statement.nodeType) {
    case "explode_at_hit":
      return {
        sourceNodeId: statement.id,
        opcode: "explode_at_event_location",
        power: statement.power,
      };
    case "if_then":
      return {
        sourceNodeId: statement.id,
        opcode: "if",
        condition: compileBooleanExpression(statement.condition),
        then: statement.then.map(compileStatement),
      };
    case "bounce_player":
      return {
        sourceNodeId: statement.id,
        opcode: "set_vertical_velocity",
        value: statement.verticalVelocity,
      };
    case "set_sheep_color":
      return { sourceNodeId: statement.id, opcode: "set_sheep_color", color: statement.color };
    case "set_sheep_speed":
      return {
        sourceNodeId: statement.id,
        opcode: "set_sheep_speed_multiplier",
        multiplier: statement.multiplier,
      };
    case "drop_item":
      return {
        sourceNodeId: statement.id,
        opcode: "drop_item",
        item: statement.item,
        quantity: statement.quantity,
      };
  }
}

function compileEvent(event: EventNode): RuntimeHandler {
  const eventNames: Record<EventNode["nodeType"], RuntimeHandler["event"]> = {
    projectile_hit_event: "projectile_hit",
    player_move_event: "player_move",
    sheep_spawn_event: "sheep_spawn",
    sheep_death_event: "sheep_death",
  };
  return {
    sourceNodeId: event.id,
    event: eventNames[event.nodeType],
    instructions: event.body.map(compileStatement),
  };
}

export function compileInstructionGraph(program: Program): InstructionGraphV2 {
  const validation = validateProgram(program);
  if (!validation.ok) {
    const summary = validation.diagnostics
      .map((item) => `${item.code}: ${item.message}`)
      .join("\n");
    throw new Error(`Cannot compile an invalid BadgerBots program:\n${summary}`);
  }
  const canonical = normalizeProgram(program);
  return {
    graphVersion: 2,
    programSchemaVersion: 2,
    programId: canonical.programId,
    projectId: canonical.projectId,
    handlers: canonical.scripts.flatMap((script) => script.body.map(compileEvent)),
  };
}

export function serializeInstructionGraph(graph: InstructionGraphV2): string {
  return `${JSON.stringify(graph)}\n`;
}
