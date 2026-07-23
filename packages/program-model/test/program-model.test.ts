import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  migrateProgram,
  normalizeProgram,
  serializeProgram,
  sheepCityCompletedExample,
  validateProgram,
  type LegacyProgramV0,
  type Program,
  type ProgramV1,
} from "../src/index.js";

describe("canonical program model", () => {
  it("serializes deterministically with canonical script and event ordering", () => {
    const shuffled: Program = {
      ...structuredClone(sheepCityCompletedExample),
      scripts: [...sheepCityCompletedExample.scripts].reverse(),
    };
    expect(serializeProgram(shuffled)).toBe(serializeProgram(sheepCityCompletedExample));
    expect(serializeProgram(shuffled)).toBe(serializeProgram(normalizeProgram(shuffled)));
  });

  it("migrates schema versions 0 and 1 into modular schema version 2", () => {
    const legacyPlayerBody: ProgramV1["scripts"][number]["body"] = [
      { id: "event-projectile-hit", nodeType: "projectile_hit_event", body: [] },
      {
        id: "event-player-move",
        nodeType: "player_move_event",
        body: [
          {
            id: "if-gold",
            nodeType: "if_on_material",
            material: "GOLD_BLOCK",
            then: [{ id: "bounce-gold", nodeType: "bounce_player", verticalVelocity: 1.2 }],
          },
        ],
      },
    ];
    const legacySheepBody: ProgramV1["scripts"][number]["body"] = [
      {
        id: "event-sheep-spawn",
        nodeType: "sheep_spawn_event",
        body: [
          { id: "sheep-red", nodeType: "set_sheep_color", color: "RED" },
          { id: "sheep-fast", nodeType: "set_sheep_speed", multiplier: 1.8 },
        ],
      },
      {
        id: "event-sheep-death",
        nodeType: "sheep_death_event",
        body: [{ id: "drop-gold", nodeType: "drop_item", item: "GOLD_INGOT", quantity: 1 }],
      },
    ];
    const legacy: LegacyProgramV0 = {
      schemaVersion: 0,
      id: "legacy-sheep-city",
      project: "sheep-city",
      areas: { Player: legacyPlayerBody, Sheep: legacySheepBody },
    };
    const migrated = migrateProgram(legacy);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.scripts.map((script) => script.scriptKind)).toEqual([
      "player",
      "game",
      "sheep",
    ]);
    const condition = migrated.scripts[0]?.body[1]?.body[0];
    expect(condition?.id).toBe("if-gold");
    expect(condition?.nodeType).toBe("if_then");
    if (!condition || condition.nodeType !== "if_then") throw new Error("Migration lost if block");
    expect(condition.condition.nodeType).toBe("equals");
    expect(validateProgram(migrated)).toEqual({ ok: true, diagnostics: [] });

    const legacyV1: ProgramV1 = {
      schemaVersion: 1,
      programId: "legacy-v1-sheep-city",
      projectId: "sheep-city",
      scripts: [
        {
          id: "script-player",
          nodeType: "script",
          scriptKind: "player",
          displayName: "Player",
          body: legacyPlayerBody,
        },
        {
          id: "script-game",
          nodeType: "script",
          scriptKind: "game",
          displayName: "Game",
          body: [],
        },
        {
          id: "script-sheep",
          nodeType: "script",
          scriptKind: "sheep",
          displayName: "Sheep",
          body: legacySheepBody,
        },
      ],
    };
    const migratedV1 = migrateProgram(legacyV1);
    expect(migratedV1.schemaVersion).toBe(2);
    expect(validateProgram(migratedV1).ok).toBe(true);
  });

  it("rejects unsafe values with child-friendly limits", () => {
    const program = structuredClone(sheepCityCompletedExample);
    const event = program.scripts[0]?.body[0];
    const explosion = event?.body[0];
    if (!explosion || explosion.nodeType !== "explode_at_hit") throw new Error("fixture changed");
    explosion.power = 100;
    expect(validateProgram(program).diagnostics).toContainEqual(
      expect.objectContaining({ code: "EXPLOSION_LIMIT", nodeId: "explode-safe" }),
    );
  });

  it.each([
    ["bounce_player", "verticalVelocity", 10, "BOUNCE_LIMIT"],
    ["set_sheep_speed", "multiplier", 10, "SPEED_LIMIT"],
    ["drop_item", "quantity", 100, "DROP_LIMIT"],
  ] as const)("enforces the %s resource limit", (nodeType, field, unsafeValue, code) => {
    const program = structuredClone(sheepCityCompletedExample);
    const statements = program.scripts.flatMap((script) =>
      script.body.flatMap((event) =>
        event.body.flatMap((statement) =>
          statement.nodeType === "if_then" ? [statement, ...statement.then] : [statement],
        ),
      ),
    );
    const statement = statements.find((candidate) => candidate.nodeType === nodeType);
    if (!statement) throw new Error(`Fixture is missing ${nodeType}`);
    Object.assign(statement, { [field]: unsafeValue });
    expect(validateProgram(program).diagnostics).toContainEqual(
      expect.objectContaining({ code, nodeId: statement.id }),
    );
  });

  it("detects actions placed in the wrong event", () => {
    const program = structuredClone(sheepCityCompletedExample);
    const event = program.scripts[0]?.body[0];
    if (!event) throw new Error("fixture changed");
    event.body.push({ id: "wrong-drop", nodeType: "drop_item", item: "GOLD_INGOT", quantity: 1 });
    expect(validateProgram(program).diagnostics).toContainEqual(
      expect.objectContaining({ code: "WRONG_EVENT_ACTION", nodeId: "wrong-drop" }),
    );
  });

  it("keeps every supported bounded numeric value deterministic", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 4, noNaN: true, noDefaultInfinity: true }),
        (power) => {
          const program = structuredClone(sheepCityCompletedExample);
          const explosion = program.scripts[0]?.body[0]?.body[0];
          if (!explosion || explosion.nodeType !== "explode_at_hit") return false;
          explosion.power = power;
          return (
            validateProgram(program).ok && serializeProgram(program) === serializeProgram(program)
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
