"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { Program } from "@badgerbots/program-model";
import {
  loadLocalEditorState,
  saveLocalEditorState,
  type LocalEditorState,
} from "../local-editor-storage";

export const CLASSROOM_BINDING_KEY = "badgerbots:classroom:workspace:v1";

export interface ClassroomBinding {
  version: 2;
  workspaceId: string;
  sessionId: string;
  revision: number;
  role: "camper" | "instructor";
  programFingerprint: string;
}

export interface BoundWorkspaceState {
  workspace: {
    id: string;
    session_id: string;
    revision: number;
    canonical_program: Program;
    active_runtime_version_id?: string | null;
    updated_at: string;
  };
  latestCommand?: {
    id: string;
    command_kind: string;
    status: string;
    acknowledgement_code?: string | null;
    issued_at: string;
  } | null;
}

let browserClient: SupabaseClient | undefined;

export function classroomConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function classroomClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart Web.",
    );
  browserClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "badgerbots:classroom:auth:v1",
    },
  });
  return browserClient;
}

export async function callClassroomApi<T = Record<string, unknown>>(
  action: string,
  body: Record<string, unknown> = {},
  explicitToken?: string,
): Promise<T> {
  const client = classroomClient();
  const token = explicitToken ?? (await client.auth.getSession()).data.session?.access_token;
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/classroom-api`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "The classroom request failed.");
  return result;
}

export function subscribeToClassroom(sessionId: string, onChange: () => void): RealtimeChannel {
  const client = classroomClient();
  return client
    .channel(`classroom-${sessionId}-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "project_workspaces",
        filter: `session_id=eq.${sessionId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "help_requests",
        filter: `session_id=eq.${sessionId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "classroom_commands",
        filter: `session_id=eq.${sessionId}`,
      },
      onChange,
    )
    .subscribe();
}

export function bindWorkspace(
  binding: Omit<ClassroomBinding, "programFingerprint">,
  program: Program,
): void {
  localStorage.setItem(
    CLASSROOM_BINDING_KEY,
    JSON.stringify({ ...binding, programFingerprint: JSON.stringify(program) }),
  );
  const state: LocalEditorState = {
    editorStateVersion: 1,
    program: structuredClone(program),
    workspaceDrafts: {},
  };
  const saved = saveLocalEditorState(localStorage, state);
  if (!saved.ok) throw new Error(saved.message);
}

export function unbindWorkspace(): void {
  localStorage.removeItem(CLASSROOM_BINDING_KEY);
}

export function loadClassroomBinding(): ClassroomBinding | undefined {
  const raw = localStorage.getItem(CLASSROOM_BINDING_KEY);
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as {
      version?: number;
      workspaceId?: string;
      sessionId?: string;
      revision?: number;
      role?: string;
      programFingerprint?: string;
    };
    if (
      (value.version !== 1 && value.version !== 2) ||
      typeof value.workspaceId !== "string" ||
      !Number.isSafeInteger(value.revision) ||
      (value.revision ?? -1) < 0 ||
      (value.role !== "camper" && value.role !== "instructor") ||
      typeof value.programFingerprint !== "string"
    )
      return undefined;
    return {
      version: 2,
      workspaceId: value.workspaceId,
      sessionId: value.version === 2 && typeof value.sessionId === "string" ? value.sessionId : "",
      revision: value.revision,
      role: value.role,
      programFingerprint: value.programFingerprint,
    } as ClassroomBinding;
  } catch {
    return undefined;
  }
}

export async function loadBoundWorkspaceState(): Promise<BoundWorkspaceState | undefined> {
  const binding = loadClassroomBinding();
  if (!binding) return undefined;
  const state = await callClassroomApi<BoundWorkspaceState>("workspace_state", {
    workspaceId: binding.workspaceId,
  });
  if (!binding.sessionId && state.workspace.session_id) {
    localStorage.setItem(
      CLASSROOM_BINDING_KEY,
      JSON.stringify({
        ...binding,
        sessionId: state.workspace.session_id,
      } satisfies ClassroomBinding),
    );
  }
  return state;
}

export function acceptBoundWorkspaceProgram(program: Program, revision: number): boolean {
  const binding = loadClassroomBinding();
  if (!binding) return false;
  const local = loadLocalEditorState(localStorage);
  if (
    local.kind === "loaded" &&
    JSON.stringify(local.state.program) !== binding.programFingerprint
  ) {
    return false;
  }
  const fingerprint = JSON.stringify(program);
  localStorage.setItem(
    CLASSROOM_BINDING_KEY,
    JSON.stringify({
      ...binding,
      revision,
      programFingerprint: fingerprint,
    } satisfies ClassroomBinding),
  );
  const saved = saveLocalEditorState(localStorage, {
    editorStateVersion: 1,
    program: structuredClone(program),
    workspaceDrafts: {},
  });
  return saved.ok;
}

export async function autosaveBoundProgram(
  program: Program,
): Promise<
  | { kind: "not_bound" | "unchanged" }
  | { kind: "saved"; revision: number }
  | { kind: "conflict"; actualRevision: number }
> {
  const binding = loadClassroomBinding();
  if (!binding) return { kind: "not_bound" };
  const fingerprint = JSON.stringify(program);
  if (fingerprint === binding.programFingerprint) return { kind: "unchanged" };
  const result = await callClassroomApi<{
    result:
      { kind: "saved"; revision: number } | { kind: "revision_conflict"; actual_revision: number };
  }>("save_program", {
    workspaceId: binding.workspaceId,
    baseRevision: binding.revision,
    clientMutationId: crypto.randomUUID(),
    program,
  });
  if (result.result.kind === "revision_conflict")
    return { kind: "conflict", actualRevision: Number(result.result.actual_revision) };
  localStorage.setItem(
    CLASSROOM_BINDING_KEY,
    JSON.stringify({
      ...binding,
      revision: Number(result.result.revision),
      programFingerprint: fingerprint,
    } satisfies ClassroomBinding),
  );
  return { kind: "saved", revision: Number(result.result.revision) };
}

export function localRunnableProgram(): Program {
  const local = loadLocalEditorState(localStorage);
  if (local.kind !== "loaded")
    throw new Error(
      local.kind === "error" ? local.message : "Open the block editor and create a program first.",
    );
  return local.state.program;
}

export async function sendCamperHeartbeat(input: {
  organizationId: string;
  sessionId: string;
  camperId: string;
}): Promise<void> {
  const { error } = await classroomClient().from("connection_health").upsert(
    {
      organization_id: input.organizationId,
      session_id: input.sessionId,
      subject_kind: "camper_web",
      subject_id: input.camperId,
      state: "online",
      summary: {},
      observed_at: new Date().toISOString(),
    },
    { onConflict: "subject_kind,subject_id" },
  );
  if (error) throw new Error("Student presence could not be updated.");
}
