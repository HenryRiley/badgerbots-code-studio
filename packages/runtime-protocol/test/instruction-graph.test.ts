import { describe, expect, it } from "vitest";
import { sheepCityCompletedExample } from "@badgerbots/program-model";
import { compileInstructionGraph, serializeInstructionGraph } from "../src/index.js";

describe("Sheep City instruction graph", () => {
  it("serializes every supported action with source attribution", () => {
    const graph = compileInstructionGraph(sheepCityCompletedExample);
    expect(graph.handlers.map((handler) => handler.event)).toEqual([
      "projectile_hit",
      "player_move",
      "sheep_spawn",
      "sheep_death",
    ]);
    expect(serializeInstructionGraph(graph)).toContain('"opcode":"explode_at_event_location"');
    expect(serializeInstructionGraph(graph)).toContain('"opcode":"if"');
    expect(serializeInstructionGraph(graph)).toContain('"opcode":"equals"');
    expect(serializeInstructionGraph(graph)).toContain('"opcode":"read_material_under_player"');
    expect(serializeInstructionGraph(graph)).toContain('"opcode":"material_constant"');
    expect(serializeInstructionGraph(graph)).toContain('"opcode":"set_vertical_velocity"');
    expect(serializeInstructionGraph(graph)).toContain('"opcode":"set_sheep_color"');
    expect(serializeInstructionGraph(graph)).toContain('"opcode":"set_sheep_speed_multiplier"');
    expect(serializeInstructionGraph(graph)).toContain('"opcode":"drop_item"');
    expect(serializeInstructionGraph(graph)).toContain('"sourceNodeId":"drop-gold"');
  });

  it("refuses to serialize programs outside resource limits", () => {
    const invalid = structuredClone(sheepCityCompletedExample);
    const explosion = invalid.scripts[0]?.body[0]?.body[0];
    if (!explosion || explosion.nodeType !== "explode_at_hit") throw new Error("fixture changed");
    explosion.power = 99;
    expect(() => compileInstructionGraph(invalid)).toThrow("EXPLOSION_LIMIT");
  });
});
