import { describe, expect, it } from "vitest";
import { sheepCityCompletedExample, sheepCityStarterProgram } from "@badgerbots/program-model";
import {
  LOCAL_EDITOR_STORAGE_KEY,
  loadLocalEditorState,
  saveLocalEditorState,
  type LocalEditorState,
} from "./local-editor-storage";

class MemoryStorage {
  value: string | null = null;
  failWrites = false;

  getItem() {
    return this.value;
  }

  setItem(_key: string, value: string) {
    if (this.failWrites) throw new Error("Storage quota exceeded.");
    this.value = value;
  }
}

function editorState(): LocalEditorState {
  return {
    editorStateVersion: 1,
    program: structuredClone(sheepCityCompletedExample),
    workspaceDrafts: {
      player: {
        blocks: {
          languageVersion: 0,
          blocks: [{ type: "bb_bounce_player", id: "loose-action", x: 120, y: 80 }],
        },
      },
    },
    textDraft: "class SheepCity {\n  // unfinished instructor edit\n}",
  };
}

describe("local editor storage", () => {
  it("round-trips the canonical program and loose visual drafts", () => {
    const storage = new MemoryStorage();
    expect(saveLocalEditorState(storage, editorState())).toEqual({ ok: true });

    const loaded = loadLocalEditorState(storage);
    expect(loaded.kind).toBe("loaded");
    if (loaded.kind !== "loaded") return;
    expect(loaded.state.program).toEqual(sheepCityCompletedExample);
    expect(loaded.state.workspaceDrafts.player).toMatchObject({
      blocks: { blocks: [{ id: "loose-action" }] },
    });
    expect(loaded.state.textDraft).toContain("unfinished instructor edit");
  });

  it("migrates the previous program-only browser save", () => {
    const storage = new MemoryStorage();
    storage.value = JSON.stringify(sheepCityStarterProgram);

    const loaded = loadLocalEditorState(storage);
    expect(loaded.kind).toBe("loaded");
    if (loaded.kind !== "loaded") return;
    expect(loaded.state.program).toEqual(sheepCityStarterProgram);
    expect(loaded.state.workspaceDrafts).toEqual({});
  });

  it("reports corrupt data instead of overwriting it", () => {
    const storage = new MemoryStorage();
    storage.value = "{not-json";
    expect(loadLocalEditorState(storage)).toMatchObject({ kind: "error" });
    expect(storage.value).toBe("{not-json");
  });

  it("does not acknowledge failed writes", () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    expect(saveLocalEditorState(storage, editorState())).toEqual({
      ok: false,
      message: "Storage quota exceeded.",
    });
  });

  it("uses the existing storage key so upgrades retain work", () => {
    expect(LOCAL_EDITOR_STORAGE_KEY).toBe("badgerbots:checkpoint1:sheep-city");
  });
});
