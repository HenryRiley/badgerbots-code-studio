import { beforeEach, describe, expect, it } from "vitest";
import { sheepCityCompletedExample, sheepCityStarterProgram } from "@badgerbots/program-model";
import { loadLocalEditorState, saveLocalEditorState } from "../local-editor-storage.js";
import {
  acknowledgeBoundWorkspaceRevision,
  acceptBoundWorkspaceProgram,
  bindWorkspace,
  loadClassroomBinding,
} from "./classroom-api.js";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("bound classroom remote updates", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: new MemoryStorage(),
      configurable: true,
    });
    bindWorkspace(
      {
        version: 2,
        workspaceId: "workspace-1",
        sessionId: "session-1",
        revision: 3,
        role: "camper",
      },
      sheepCityStarterProgram,
    );
  });

  it("accepts a newer teacher revision when the student has no local changes", () => {
    expect(acceptBoundWorkspaceProgram(sheepCityCompletedExample, 4)).toBe(true);
    expect(loadClassroomBinding()?.revision).toBe(4);
    const local = loadLocalEditorState(localStorage);
    expect(local.kind).toBe("loaded");
    if (local.kind === "loaded") {
      expect(local.state.program).toEqual(sheepCityCompletedExample);
      expect(local.state.workspaceDrafts).toEqual({});
    }
  });

  it("preserves a changed local program instead of applying a teacher revision", () => {
    const saved = saveLocalEditorState(localStorage, {
      editorStateVersion: 1,
      program: sheepCityCompletedExample,
      workspaceDrafts: {},
    });
    expect(saved.ok).toBe(true);
    expect(acceptBoundWorkspaceProgram(sheepCityStarterProgram, 4)).toBe(false);
    expect(loadClassroomBinding()?.revision).toBe(3);
    const local = loadLocalEditorState(localStorage);
    expect(local.kind).toBe("loaded");
    if (local.kind === "loaded") {
      expect(local.state.program).toEqual(sheepCityCompletedExample);
    }
  });

  it("can explicitly accept a remote revision after showing the conflict choice", () => {
    const saved = saveLocalEditorState(localStorage, {
      editorStateVersion: 1,
      program: sheepCityCompletedExample,
      workspaceDrafts: {},
    });
    expect(saved.ok).toBe(true);
    expect(acceptBoundWorkspaceProgram(sheepCityStarterProgram, 4)).toBe(false);
    expect(acceptBoundWorkspaceProgram(sheepCityStarterProgram, 4, { force: true })).toBe(true);
    expect(loadClassroomBinding()?.revision).toBe(4);
    expect(loadLocalEditorState(localStorage)).toMatchObject({
      kind: "loaded",
      state: { program: sheepCityStarterProgram },
    });
  });

  it("rebases the concurrency cursor without overwriting local work", () => {
    expect(acknowledgeBoundWorkspaceRevision(7)).toBe(true);
    expect(loadClassroomBinding()?.revision).toBe(7);
    expect(loadLocalEditorState(localStorage)).toMatchObject({
      kind: "loaded",
      state: { program: sheepCityStarterProgram },
    });
  });
});
