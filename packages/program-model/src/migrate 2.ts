import { LegacyProgramV0Schema, ProgramV1Schema } from "./schema.js";
import type { Program, ScriptKind, ScriptNode } from "./types.js";

const scriptMetadata: Record<ScriptKind, Pick<ScriptNode, "id" | "displayName">> = {
  player: { id: "script-player", displayName: "Player" },
  game: { id: "script-game", displayName: "Game" },
  sheep: { id: "script-sheep", displayName: "Sheep" },
};

export function migrateProgram(input: unknown): Program {
  const version =
    typeof input === "object" && input !== null && "schemaVersion" in input
      ? (input as { schemaVersion?: unknown }).schemaVersion
      : undefined;

  if (version === 1) return ProgramV1Schema.parse(input);
  if (version !== 0) {
    throw new Error(
      `Unsupported program schema version ${String(version)}. This editor supports versions 0 and 1.`,
    );
  }

  const legacy = LegacyProgramV0Schema.parse(input);
  const areas = { player: legacy.areas.Player, game: legacy.areas.Game, sheep: legacy.areas.Sheep };
  const scripts = (["player", "game", "sheep"] as const).map((scriptKind): ScriptNode => ({
    ...scriptMetadata[scriptKind],
    nodeType: "script",
    scriptKind,
    body: areas[scriptKind] ?? [],
  }));

  return ProgramV1Schema.parse({
    schemaVersion: 1,
    programId: legacy.id,
    projectId: legacy.project,
    scripts,
  });
}
