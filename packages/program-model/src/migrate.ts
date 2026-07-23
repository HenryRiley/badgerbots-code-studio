import { LegacyProgramV0Schema, ProgramV1Schema, ProgramV2Schema } from "./schema.js";
import type {
  LegacyStatementV1,
  Program,
  ProgramV1,
  ScriptKind,
  ScriptNode,
  StatementNode,
} from "./types.js";

const scriptMetadata: Record<ScriptKind, Pick<ScriptNode, "id" | "displayName">> = {
  player: { id: "script-player", displayName: "Player" },
  game: { id: "script-game", displayName: "Game" },
  sheep: { id: "script-sheep", displayName: "Sheep" },
};

function derivedId(sourceId: string, role: string): string {
  const suffix = `-${role}`;
  return `${sourceId.slice(0, 63 - suffix.length)}${suffix}`;
}

function migrateStatement(statement: LegacyStatementV1): StatementNode {
  if (statement.nodeType !== "if_on_material") return structuredClone(statement);
  return {
    id: statement.id,
    nodeType: "if_then",
    condition: {
      id: derivedId(statement.id, "equals"),
      nodeType: "equals",
      left: {
        id: derivedId(statement.id, "material-under"),
        nodeType: "get_material_under_player",
      },
      right: {
        id: derivedId(statement.id, "gold"),
        nodeType: "material_literal",
        material: statement.material,
      },
    },
    then: statement.then.map(migrateStatement),
  };
}

function migrateV1(program: ProgramV1): Program {
  return ProgramV2Schema.parse({
    schemaVersion: 2,
    programId: program.programId,
    projectId: program.projectId,
    scripts: program.scripts.map((script) => ({
      ...script,
      body: script.body.map((event) => ({
        ...event,
        body: event.body.map(migrateStatement),
      })),
    })),
  });
}

export function migrateProgram(input: unknown): Program {
  const version =
    typeof input === "object" && input !== null && "schemaVersion" in input
      ? (input as { schemaVersion?: unknown }).schemaVersion
      : undefined;

  if (version === 2) return ProgramV2Schema.parse(input);
  if (version === 1) return migrateV1(ProgramV1Schema.parse(input));
  if (version !== 0) {
    throw new Error(
      `Unsupported program schema version ${String(version)}. This editor supports versions 0, 1, and 2.`,
    );
  }

  const legacy = LegacyProgramV0Schema.parse(input);
  const areas = { player: legacy.areas.Player, game: legacy.areas.Game, sheep: legacy.areas.Sheep };
  const scripts = (["player", "game", "sheep"] as const).map(
    (scriptKind): ProgramV1["scripts"][number] => ({
      ...scriptMetadata[scriptKind],
      nodeType: "script",
      scriptKind,
      body: areas[scriptKind] ?? [],
    }),
  );

  return migrateV1(
    ProgramV1Schema.parse({
      schemaVersion: 1,
      programId: legacy.id,
      projectId: legacy.project,
      scripts,
    }),
  );
}
