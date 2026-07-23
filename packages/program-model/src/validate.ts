import { ProgramV2Schema } from "./schema.js";
import type {
  BooleanExpressionNode,
  Diagnostic,
  EventNode,
  MaterialExpressionNode,
  ScriptNode,
  StatementNode,
  ValidationResult,
} from "./types.js";

const allowedEvents: Record<ScriptNode["scriptKind"], EventNode["nodeType"][]> = {
  player: ["projectile_hit_event", "player_move_event"],
  game: [],
  sheep: ["sheep_spawn_event", "sheep_death_event"],
};

const allowedStatements: Record<EventNode["nodeType"], StatementNode["nodeType"][]> = {
  projectile_hit_event: ["explode_at_hit"],
  player_move_event: ["if_then", "bounce_player"],
  sheep_spawn_event: ["set_sheep_color", "set_sheep_speed"],
  sheep_death_event: ["drop_item"],
};

function error(code: string, message: string, nodeId?: string, suggestion?: string): Diagnostic {
  return {
    code,
    severity: "error",
    message,
    ...(nodeId ? { nodeId } : {}),
    ...(suggestion ? { suggestion } : {}),
  };
}

export function validateProgram(input: unknown): ValidationResult {
  const parsed = ProgramV2Schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      diagnostics: parsed.error.issues.map((issue) => ({
        code: "PROGRAM_SHAPE",
        severity: "error",
        message: `This program has an unsupported value at ${issue.path.join(".") || "the root"}: ${issue.message}`,
        path: issue.path.join("."),
        suggestion:
          "Return to blocks or undo the last text edit, then try a supported BadgerBots construct.",
      })),
    };
  }

  const program = parsed.data;
  const diagnostics: Diagnostic[] = [];
  const nodeIds = new Set<string>([program.programId]);
  let nodeCount = 1;

  function register(id: string) {
    nodeCount += 1;
    if (nodeIds.has(id))
      diagnostics.push(
        error(
          "DUPLICATE_NODE_ID",
          `Two blocks use the ID “${id}”.`,
          id,
          "Duplicate the block again so it receives a fresh ID.",
        ),
      );
    nodeIds.add(id);
  }

  function visitMaterialExpression(expression: MaterialExpressionNode) {
    register(expression.id);
  }

  function visitBooleanExpression(expression: BooleanExpressionNode) {
    register(expression.id);
    visitMaterialExpression(expression.left);
    visitMaterialExpression(expression.right);
  }

  function visitStatement(statement: StatementNode, event: EventNode, depth: number) {
    register(statement.id);
    if (depth > 8)
      diagnostics.push(
        error(
          "MAX_DEPTH",
          "This stack is nested too deeply. Keep it to 8 levels or fewer.",
          statement.id,
        ),
      );
    if (!allowedStatements[event.nodeType].includes(statement.nodeType)) {
      diagnostics.push(
        error(
          "WRONG_EVENT_ACTION",
          `${friendlyStatement(statement)} cannot be used inside ${friendlyEvent(event)}.`,
          statement.id,
          `Move this block to a matching event in the correct script tab.`,
        ),
      );
    }
    if (statement.nodeType === "explode_at_hit" && (statement.power < 0.5 || statement.power > 4)) {
      diagnostics.push(
        error(
          "EXPLOSION_LIMIT",
          "Explosion power must be from 0.5 to 4.",
          statement.id,
          "Choose a smaller safe explosion.",
        ),
      );
    }
    if (
      statement.nodeType === "bounce_player" &&
      (statement.verticalVelocity < 0.1 || statement.verticalVelocity > 3)
    ) {
      diagnostics.push(
        error("BOUNCE_LIMIT", "Bounce strength must be from 0.1 to 3.", statement.id),
      );
    }
    if (
      statement.nodeType === "set_sheep_speed" &&
      (statement.multiplier < 0.1 || statement.multiplier > 4)
    ) {
      diagnostics.push(
        error("SPEED_LIMIT", "Sheep speed must be from 0.1 to 4 times normal speed.", statement.id),
      );
    }
    if (statement.nodeType === "drop_item" && (statement.quantity < 1 || statement.quantity > 16)) {
      diagnostics.push(
        error("DROP_LIMIT", "A sheep may drop from 1 to 16 gold ingots.", statement.id),
      );
    }
    if (statement.nodeType === "if_then") {
      visitBooleanExpression(statement.condition);
      for (const child of statement.then) visitStatement(child, event, depth + 1);
    }
  }

  const expectedScripts = new Set(["player", "game", "sheep"]);
  for (const script of program.scripts) {
    register(script.id);
    expectedScripts.delete(script.scriptKind);
    const seenEvents = new Set<string>();
    for (const event of script.body) {
      register(event.id);
      if (!allowedEvents[script.scriptKind].includes(event.nodeType)) {
        diagnostics.push(
          error(
            "WRONG_SCRIPT_EVENT",
            `${friendlyEvent(event)} belongs in a different script tab.`,
            event.id,
            `Move it out of ${script.displayName}.`,
          ),
        );
      }
      if (seenEvents.has(event.nodeType))
        diagnostics.push(
          error(
            "DUPLICATE_EVENT",
            `${script.displayName} already has ${friendlyEvent(event)}. Combine the block stacks.`,
            event.id,
          ),
        );
      seenEvents.add(event.nodeType);
      if (event.body.length > 32)
        diagnostics.push(
          error("EVENT_SIZE_LIMIT", "An event may contain at most 32 top-level blocks.", event.id),
        );
      for (const statement of event.body) visitStatement(statement, event, 1);
    }
  }
  for (const missing of expectedScripts)
    diagnostics.push(
      error(
        "MISSING_SCRIPT",
        `The ${missing} script tab is missing.`,
        undefined,
        "Restore the required Player, Game, and Sheep tabs.",
      ),
    );
  if (program.scripts.length !== 3)
    diagnostics.push(
      error("SCRIPT_COUNT", "Sheep City requires exactly Player, Game, and Sheep script tabs."),
    );
  if (nodeCount > 128)
    diagnostics.push(
      error(
        "PROGRAM_SIZE_LIMIT",
        "This Sheep City program has more than 128 nodes. Split or simplify the block stacks.",
      ),
    );

  return { ok: diagnostics.every((item) => item.severity !== "error"), diagnostics };
}

function friendlyEvent(event: EventNode): string {
  return {
    projectile_hit_event: "the projectile-hit event",
    player_move_event: "the player-move event",
    sheep_spawn_event: "the sheep-spawn event",
    sheep_death_event: "the sheep-death event",
  }[event.nodeType];
}

function friendlyStatement(statement: StatementNode): string {
  return {
    explode_at_hit: "Explosion",
    bounce_player: "Bounce player",
    if_then: "If",
    set_sheep_color: "Set sheep color",
    set_sheep_speed: "Set sheep speed",
    drop_item: "Drop item",
  }[statement.nodeType];
}
