import { describe, expect, it } from "vitest";
import { formatProgram, parseProgram } from "@badgerbots/java-dsl";
import {
  normalizeProgram,
  sheepCityCompletedExample,
  validateProgram,
} from "@badgerbots/program-model";
import {
  Blockly,
  getScript,
  registerSheepCityBlocks,
  replaceProgramScript,
  scriptToWorkspace,
  searchBlockCatalog,
  workspaceToScript,
} from "../src/index.js";

describe("Blockly canonical AST adapters", () => {
  it.each(["player", "game", "sheep"] as const)(
    "round-trips the %s tab without semantic loss",
    (kind) => {
      const script = getScript(sheepCityCompletedExample, kind);
      const workspace = scriptToWorkspace(script, new Blockly.Workspace());
      const roundTripped = workspaceToScript(workspace, {
        id: script.id,
        scriptKind: script.scriptKind,
        displayName: script.displayName,
      });
      expect(roundTripped).toEqual(script);
      const program = replaceProgramScript(sheepCityCompletedExample, roundTripped);
      expect(program).toEqual(normalizeProgram(sheepCityCompletedExample));
      expect(validateProgram(program).ok).toBe(true);
      workspace.dispose();
    },
  );

  it("searches the complete implemented library without lesson filtering", () => {
    expect(searchBlockCatalog("gold").map((entry) => entry.type)).toEqual([
      "bb_material_gold_block",
      "bb_drop_gold",
    ]);
    expect(searchBlockCatalog("")).toHaveLength(13);
    expect(searchBlockCatalog("").every((entry) => entry.implemented)).toBe(true);
  });

  it("renders the gold check as four independently connected typed blocks", () => {
    const script = getScript(sheepCityCompletedExample, "player");
    const workspace = scriptToWorkspace(script, new Blockly.Workspace());
    const ifBlock = workspace.getBlockById("if-gold");
    const equalsBlock = workspace.getBlockById("equals-gold");
    expect(ifBlock?.type).toBe("bb_if_then");
    expect(ifBlock?.getInputTargetBlock("CONDITION")).toBe(equalsBlock);
    expect(equalsBlock?.getInputTargetBlock("LEFT")?.type).toBe("bb_get_material_under_player");
    expect(equalsBlock?.getInputTargetBlock("RIGHT")?.type).toBe("bb_material_gold_block");
    workspace.dispose();
  });

  it("accepts an action block dragged into an event body", () => {
    const source = getScript(sheepCityCompletedExample, "player");
    registerSheepCityBlocks();
    const workspace = new Blockly.Workspace();
    const moveEvent = workspace.newBlock("bb_event_player_move", "drag-event");
    const bounce = workspace.newBlock("bb_bounce_player", "dragged-bounce");
    bounce.setFieldValue("1.2", "STRENGTH");
    const eventConnection = moveEvent.getInput("DO")?.connection;
    if (!eventConnection || !bounce.previousConnection) throw new Error("Block contract changed");
    eventConnection.connect(bounce.previousConnection);

    expect(workspaceToScript(workspace, source).body).toEqual([
      {
        id: "drag-event",
        nodeType: "player_move_event",
        body: [
          {
            id: "dragged-bounce",
            nodeType: "bounce_player",
            verticalVelocity: 1.2,
          },
        ],
      },
    ]);
    workspace.dispose();
  });

  it("maps Blockly-generated IDs to stable canonical node IDs", () => {
    const source = getScript(sheepCityCompletedExample, "player");
    registerSheepCityBlocks();
    const workspace = new Blockly.Workspace();
    const moveEvent = workspace.newBlock("bb_event_player_move");
    const bounce = workspace.newBlock("bb_bounce_player");
    const eventConnection = moveEvent.getInput("DO")?.connection;
    if (!eventConnection || !bounce.previousConnection) throw new Error("Block contract changed");
    eventConnection.connect(bounce.previousConnection);

    const first = workspaceToScript(workspace, source);
    const second = workspaceToScript(workspace, source);
    expect(first).toEqual(second);
    expect(first.body[0]?.id).toMatch(/^[a-z][a-z0-9-]{2,63}$/);
    expect(first.body[0]?.body[0]?.id).toMatch(/^[a-z][a-z0-9-]{2,63}$/);
    workspace.dispose();
  });

  it("refuses an incomplete generic if instead of inventing a condition", () => {
    const source = getScript(sheepCityCompletedExample, "player");
    const workspace = scriptToWorkspace(source, new Blockly.Workspace());
    const moveEvent = workspace.getBlockById("event-player-move");
    const existingIf = workspace.getBlockById("if-gold");
    existingIf?.dispose(false);
    const incompleteIf = workspace.newBlock("bb_if_then", "incomplete-if");
    const eventConnection = moveEvent?.getInput("DO")?.connection;
    if (!eventConnection || !incompleteIf.previousConnection) throw new Error("Fixture changed");
    eventConnection.connect(incompleteIf.previousConnection);
    expect(() => workspaceToScript(workspace, source)).toThrow("missing its condition block");
    workspace.dispose();
  });

  it("refuses an unknown block instead of silently discarding it", () => {
    const workspace = new Blockly.Workspace();
    Blockly.Blocks["unknown_test_block"] = { init() {} };
    workspace.newBlock("unknown_test_block", "unknown-block");
    expect(() =>
      workspaceToScript(workspace, { id: "script-game", scriptKind: "game", displayName: "Game" }),
    ).toThrow("No code was discarded");
    delete Blockly.Blocks["unknown_test_block"];
    workspace.dispose();
  });

  it.each(["player", "game", "sheep"] as const)(
    "round-trips the %s tab through blocks, text, and back to blocks",
    (kind) => {
      const sourceScript = getScript(sheepCityCompletedExample, kind);
      const firstWorkspace = scriptToWorkspace(sourceScript, new Blockly.Workspace());
      const fromBlocks = workspaceToScript(firstWorkspace, sourceScript);
      const fromBlocksProgram = replaceProgramScript(sheepCityCompletedExample, fromBlocks);
      const parsed = parseProgram(formatProgram(fromBlocksProgram));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const parsedScript = getScript(parsed.program, kind);
      const secondWorkspace = scriptToWorkspace(parsedScript, new Blockly.Workspace());
      const returnedToBlocks = workspaceToScript(secondWorkspace, parsedScript);
      expect(returnedToBlocks).toEqual(sourceScript);

      firstWorkspace.dispose();
      secondWorkspace.dispose();
    },
  );

  it("round-trips canonical text through blocks and back to identical text", () => {
    const canonicalText = formatProgram(sheepCityCompletedExample);
    const parsed = parseProgram(canonicalText);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    let program = parsed.program;
    for (const kind of ["player", "game", "sheep"] as const) {
      const script = getScript(program, kind);
      const workspace = scriptToWorkspace(script, new Blockly.Workspace());
      program = replaceProgramScript(program, workspaceToScript(workspace, script));
      workspace.dispose();
    }
    expect(formatProgram(program)).toBe(canonicalText);
  });
});
