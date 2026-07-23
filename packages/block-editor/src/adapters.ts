import * as Blockly from "blockly/core";
import {
  normalizeProgram,
  type BooleanExpressionNode,
  type EventNode,
  type MaterialExpressionNode,
  type Program,
  type ScriptKind,
  type ScriptNode,
  type StatementNode,
} from "@badgerbots/program-model";
import { registerSheepCityBlocks } from "./blocks.js";

const eventToBlock: Record<EventNode["nodeType"], string> = {
  projectile_hit_event: "bb_event_projectile_hit",
  player_move_event: "bb_event_player_move",
  sheep_spawn_event: "bb_event_sheep_spawn",
  sheep_death_event: "bb_event_sheep_death",
};

const blockToEvent = Object.fromEntries(
  Object.entries(eventToBlock).map(([event, block]) => [block, event]),
) as Record<string, EventNode["nodeType"]>;

const canonicalNodeIdPattern = /^[a-z][a-z0-9-]{2,63}$/;

function canonicalNodeId(block: Blockly.Block): string {
  if (canonicalNodeIdPattern.test(block.id)) return block.id;
  let hash = 0xcbf29ce484222325n;
  for (const character of block.id) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `node-${hash.toString(36)}`;
}

function createBlock(workspace: Blockly.Workspace, type: string, id: string): Blockly.Block {
  const block = workspace.newBlock(type, id);
  return block;
}

function connectStatementChain(parent: Blockly.Connection | null, blocks: Blockly.Block[]) {
  let connection = parent;
  for (const block of blocks) {
    if (!connection || !block.previousConnection) break;
    connection.connect(block.previousConnection);
    connection = block.nextConnection;
  }
}

function connectValue(parent: Blockly.Block, inputName: string, child: Blockly.Block) {
  const input = parent.getInput(inputName)?.connection;
  if (!input || !child.outputConnection) {
    throw new Error(`Cannot connect ${child.type} to ${parent.type}.${inputName}.`);
  }
  input.connect(child.outputConnection);
}

function materialExpressionToBlock(
  expression: MaterialExpressionNode,
  workspace: Blockly.Workspace,
): Blockly.Block {
  switch (expression.nodeType) {
    case "get_material_under_player":
      return createBlock(workspace, "bb_get_material_under_player", expression.id);
    case "material_literal":
      return createBlock(workspace, "bb_material_gold_block", expression.id);
  }
}

function booleanExpressionToBlock(
  expression: BooleanExpressionNode,
  workspace: Blockly.Workspace,
): Blockly.Block {
  const block = createBlock(workspace, "bb_equals", expression.id);
  connectValue(block, "LEFT", materialExpressionToBlock(expression.left, workspace));
  connectValue(block, "RIGHT", materialExpressionToBlock(expression.right, workspace));
  return block;
}

function statementToBlock(statement: StatementNode, workspace: Blockly.Workspace): Blockly.Block {
  switch (statement.nodeType) {
    case "explode_at_hit": {
      const block = createBlock(workspace, "bb_explode_at_hit", statement.id);
      block.setFieldValue(String(statement.power), "POWER");
      return block;
    }
    case "if_then": {
      const block = createBlock(workspace, "bb_if_then", statement.id);
      connectValue(block, "CONDITION", booleanExpressionToBlock(statement.condition, workspace));
      const children = statement.then.map((child) => statementToBlock(child, workspace));
      connectStatementChain(block.getInput("DO")?.connection ?? null, children);
      return block;
    }
    case "bounce_player": {
      const block = createBlock(workspace, "bb_bounce_player", statement.id);
      block.setFieldValue(String(statement.verticalVelocity), "STRENGTH");
      return block;
    }
    case "set_sheep_color":
      return createBlock(workspace, "bb_set_sheep_red", statement.id);
    case "set_sheep_speed": {
      const block = createBlock(workspace, "bb_set_sheep_speed", statement.id);
      block.setFieldValue(String(statement.multiplier), "SPEED");
      return block;
    }
    case "drop_item": {
      const block = createBlock(workspace, "bb_drop_gold", statement.id);
      block.setFieldValue(String(statement.quantity), "QUANTITY");
      return block;
    }
  }
}

function eventToWorkspace(event: EventNode, workspace: Blockly.Workspace): Blockly.Block {
  const block = createBlock(workspace, eventToBlock[event.nodeType], event.id);
  connectStatementChain(
    block.getInput("DO")?.connection ?? null,
    event.body.map((statement) => statementToBlock(statement, workspace)),
  );
  return block;
}

export function scriptToWorkspace(
  script: ScriptNode,
  workspace = new Blockly.Workspace(),
): Blockly.Workspace {
  registerSheepCityBlocks();
  workspace.clear();
  for (const event of script.body) eventToWorkspace(event, workspace);
  if (workspace instanceof Blockly.WorkspaceSvg) {
    for (const block of workspace.getAllBlocks(false)) {
      block.initSvg();
      block.render();
    }
    workspace.getTopBlocks(true).forEach((block, index) => {
      block.moveBy(36, 36 + index * 190);
    });
    workspace.render();
  }
  return workspace;
}

function numberField(block: Blockly.Block, field: string): number {
  return Number(block.getFieldValue(field));
}

function requiredInputBlock(block: Blockly.Block, inputName: string): Blockly.Block {
  const child = block.getInputTargetBlock(inputName);
  if (!child) {
    throw new Error(
      `${block.type} is missing its ${inputName.toLocaleLowerCase()} block. No code was discarded.`,
    );
  }
  return child;
}

function materialExpressionBlockToAst(block: Blockly.Block): MaterialExpressionNode {
  switch (block.type) {
    case "bb_get_material_under_player":
      return { id: canonicalNodeId(block), nodeType: "get_material_under_player" };
    case "bb_material_gold_block":
      return { id: canonicalNodeId(block), nodeType: "material_literal", material: "GOLD_BLOCK" };
    default:
      throw new Error(`Unsupported material value block ${block.type}. No code was discarded.`);
  }
}

function booleanExpressionBlockToAst(block: Blockly.Block): BooleanExpressionNode {
  if (block.type !== "bb_equals") {
    throw new Error(`Unsupported condition block ${block.type}. No code was discarded.`);
  }
  return {
    id: canonicalNodeId(block),
    nodeType: "equals",
    left: materialExpressionBlockToAst(requiredInputBlock(block, "LEFT")),
    right: materialExpressionBlockToAst(requiredInputBlock(block, "RIGHT")),
  };
}

function statementChainToAst(first: Blockly.Block | null): StatementNode[] {
  const statements: StatementNode[] = [];
  let block = first;
  while (block) {
    switch (block.type) {
      case "bb_explode_at_hit":
        statements.push({
          id: canonicalNodeId(block),
          nodeType: "explode_at_hit",
          power: numberField(block, "POWER"),
        });
        break;
      case "bb_if_then":
        statements.push({
          id: canonicalNodeId(block),
          nodeType: "if_then",
          condition: booleanExpressionBlockToAst(requiredInputBlock(block, "CONDITION")),
          then: statementChainToAst(block.getInputTargetBlock("DO")),
        });
        break;
      case "bb_bounce_player":
        statements.push({
          id: canonicalNodeId(block),
          nodeType: "bounce_player",
          verticalVelocity: numberField(block, "STRENGTH"),
        });
        break;
      case "bb_set_sheep_red":
        statements.push({
          id: canonicalNodeId(block),
          nodeType: "set_sheep_color",
          color: "RED",
        });
        break;
      case "bb_set_sheep_speed":
        statements.push({
          id: canonicalNodeId(block),
          nodeType: "set_sheep_speed",
          multiplier: numberField(block, "SPEED"),
        });
        break;
      case "bb_drop_gold":
        statements.push({
          id: canonicalNodeId(block),
          nodeType: "drop_item",
          item: "GOLD_INGOT",
          quantity: numberField(block, "QUANTITY"),
        });
        break;
      default:
        throw new Error(`Unsupported Blockly block ${block.type}. No code was discarded.`);
    }
    block = block.getNextBlock();
  }
  return statements;
}

export function workspaceToScript(
  workspace: Blockly.Workspace,
  metadata: Pick<ScriptNode, "id" | "scriptKind" | "displayName">,
): ScriptNode {
  const body = workspace.getTopBlocks(true).map((block): EventNode => {
    const nodeType = blockToEvent[block.type];
    if (!nodeType)
      throw new Error(`Unsupported top-level Blockly block ${block.type}. No code was discarded.`);
    return {
      id: canonicalNodeId(block),
      nodeType,
      body: statementChainToAst(block.getInputTargetBlock("DO")),
    };
  });
  return { ...metadata, nodeType: "script", body };
}

export function replaceProgramScript(program: Program, script: ScriptNode): Program {
  return normalizeProgram({
    ...program,
    scripts: program.scripts.map((current) =>
      current.scriptKind === script.scriptKind ? script : current,
    ),
  });
}

export function getScript(program: Program, scriptKind: ScriptKind): ScriptNode {
  const script = program.scripts.find((candidate) => candidate.scriptKind === scriptKind);
  if (!script) throw new Error(`Program is missing the ${scriptKind} script.`);
  return script;
}
