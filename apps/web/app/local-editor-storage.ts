import {
  migrateProgram,
  validateProgram,
  type Program,
  type ScriptKind,
} from "@badgerbots/program-model";

export const LOCAL_EDITOR_STORAGE_KEY = "badgerbots:checkpoint1:sheep-city";

export type WorkspaceDraft = Record<string, unknown>;

export interface LocalEditorState {
  editorStateVersion: 1;
  program: Program;
  workspaceDrafts: Partial<Record<ScriptKind, WorkspaceDraft>>;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type LoadLocalEditorResult =
  | { kind: "empty" }
  | { kind: "loaded"; state: LocalEditorState }
  | { kind: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrateEditorState(value: unknown): LocalEditorState {
  const envelope = isRecord(value) && value.editorStateVersion === 1 ? value : undefined;
  const program = migrateProgram(envelope ? envelope.program : value);
  const validation = validateProgram(program);
  if (!validation.ok) {
    throw new Error(validation.diagnostics[0]?.message ?? "The saved program is invalid.");
  }

  const rawDrafts = envelope?.workspaceDrafts;
  const workspaceDrafts: LocalEditorState["workspaceDrafts"] = {};
  if (isRecord(rawDrafts)) {
    for (const scriptKind of ["player", "game", "sheep"] as const) {
      const draft = rawDrafts[scriptKind];
      if (isRecord(draft)) workspaceDrafts[scriptKind] = draft;
    }
  }

  return { editorStateVersion: 1, program, workspaceDrafts };
}

export function loadLocalEditorState(storage: StorageLike): LoadLocalEditorResult {
  try {
    const stored = storage.getItem(LOCAL_EDITOR_STORAGE_KEY);
    if (!stored) return { kind: "empty" };
    return { kind: "loaded", state: migrateEditorState(JSON.parse(stored)) };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Unknown local storage error.",
    };
  }
}

export function saveLocalEditorState(
  storage: StorageLike,
  state: LocalEditorState,
): { ok: true } | { ok: false; message: string } {
  try {
    storage.setItem(LOCAL_EDITOR_STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown local storage error.",
    };
  }
}
