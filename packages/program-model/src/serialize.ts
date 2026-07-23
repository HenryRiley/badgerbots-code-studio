import { ProgramV2Schema } from "./schema.js";
import type { EventNode, Program, ScriptNode, StatementNode } from "./types.js";

const scriptOrder = new Map([
  ["player", 0],
  ["game", 1],
  ["sheep", 2],
]);
const eventOrder = new Map([
  ["projectile_hit_event", 0],
  ["player_move_event", 1],
  ["sheep_spawn_event", 2],
  ["sheep_death_event", 3],
]);

function normalizeStatement(statement: StatementNode): StatementNode {
  if (statement.nodeType !== "if_then") return structuredClone(statement);
  return { ...structuredClone(statement), then: statement.then.map(normalizeStatement) };
}

function normalizeEvent(event: EventNode): EventNode {
  return { ...structuredClone(event), body: event.body.map(normalizeStatement) };
}

function normalizeScript(script: ScriptNode): ScriptNode {
  return {
    ...structuredClone(script),
    body: script.body
      .map(normalizeEvent)
      .sort(
        (left, right) =>
          (eventOrder.get(left.nodeType) ?? 99) - (eventOrder.get(right.nodeType) ?? 99),
      ),
  };
}

export function normalizeProgram(program: Program): Program {
  const parsed = ProgramV2Schema.parse(program);
  return {
    ...structuredClone(parsed),
    scripts: parsed.scripts
      .map(normalizeScript)
      .sort(
        (left, right) =>
          (scriptOrder.get(left.scriptKind) ?? 99) - (scriptOrder.get(right.scriptKind) ?? 99),
      ),
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortKeys(nested)]),
  );
}

export function serializeProgram(program: Program): string {
  return `${JSON.stringify(sortKeys(normalizeProgram(program)))}\n`;
}
