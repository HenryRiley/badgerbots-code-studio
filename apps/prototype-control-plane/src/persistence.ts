import { createClient } from "@supabase/supabase-js";
import type { ProgramVersion, StoreState, Workspace } from "@badgerbots/control-plane";

export type PrototypePersistenceMode = "memory" | "supabase";

interface DatabaseResult {
  data: unknown;
  error: { message: string } | null;
}

interface PrototypeDatabaseClient {
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<DatabaseResult>;
  from(table: string): {
    upsert(row: Record<string, unknown>): PromiseLike<DatabaseResult>;
    update(row: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<DatabaseResult>;
    };
  };
}

export interface PrototypePersistence {
  readonly mode: PrototypePersistenceMode;
  initialize(state: StoreState): Promise<void>;
  join(state: StoreState): Promise<void>;
  save(workspace: Workspace, version: ProgramVersion): Promise<void>;
  setActiveRuntimeVersion(workspaceId: string, versionId: string | undefined): Promise<void>;
}

export class MemoryPrototypePersistence implements PrototypePersistence {
  readonly mode = "memory" as const;

  initialize(state: StoreState): Promise<void> {
    void state;
    return Promise.resolve();
  }

  join(state: StoreState): Promise<void> {
    void state;
    return Promise.resolve();
  }

  save(workspace: Workspace, version: ProgramVersion): Promise<void> {
    void workspace;
    void version;
    return Promise.resolve();
  }

  setActiveRuntimeVersion(workspaceId: string, versionId: string | undefined): Promise<void> {
    void workspaceId;
    void versionId;
    return Promise.resolve();
  }
}

export class SupabasePrototypePersistence implements PrototypePersistence {
  readonly mode = "supabase" as const;

  constructor(private readonly client: PrototypeDatabaseClient) {}

  async initialize(state: StoreState): Promise<void> {
    const organization = required(state.organizations.at(-1), "organization");
    const location = required(state.locations.at(-1), "location");
    const instructor = required(state.instructors.at(-1), "instructor");
    const membership = required(state.memberships.at(-1), "membership");
    const session = required(state.sessions.at(-1), "session");

    await this.upsert("organizations", { id: organization.id, name: organization.name });
    await this.upsert("locations", {
      id: location.id,
      organization_id: location.organizationId,
      name: location.name,
    });
    await this.upsert("instructors", {
      id: instructor.id,
      auth_subject: instructor.authUserId,
      normalized_email: instructor.normalizedEmail,
      display_email: instructor.displayEmail,
    });
    await this.upsert("memberships", {
      organization_id: membership.organizationId,
      instructor_id: membership.instructorId,
      role: membership.role,
    });
    await this.upsert("sessions", {
      id: session.id,
      organization_id: session.organizationId,
      location_id: session.locationId,
      owner_instructor_id: session.ownerInstructorId,
      track_id: session.trackId,
      starts_on: session.startsOn,
      ends_on: session.endsOn,
      join_code_digest: session.joinCodeDigest,
      retention_state: session.retentionState,
      recoverable_until: session.recoverableUntil ?? null,
    });
    await this.upsert("session_instructors", {
      session_id: session.id,
      instructor_id: session.ownerInstructorId,
      role: "owner",
    });
  }

  async join(state: StoreState): Promise<void> {
    const camper = required(state.campers.at(-1), "camper");
    const workspace = required(state.workspaces.at(-1), "workspace");
    await this.upsert("campers", {
      id: camper.id,
      session_id: camper.sessionId,
      first_name: camper.firstName,
      last_initial: camper.lastInitial,
      access_credential_digest: camper.accessTokenDigest,
    });
    await this.upsert("project_workspaces", {
      id: workspace.id,
      organization_id: workspace.organizationId,
      session_id: workspace.sessionId,
      camper_id: workspace.camperId,
      project_key: workspace.projectId,
      revision: workspace.revision,
      canonical_program: workspace.currentProgram,
    });
  }

  async save(workspace: Workspace, version: ProgramVersion): Promise<void> {
    const authorId =
      version.author.kind === "camper" ? version.author.camperId : version.author.instructorId;
    const { data, error } = await this.client.rpc("save_program_version_v2", {
      target_workspace_id: workspace.id,
      expected_revision: version.revision - 1,
      next_program: version.program,
      created_version_id: version.id,
      version_author_kind: version.author.kind,
      version_author_id: authorId,
      mutation_id: version.clientMutationId,
    });
    if (error) throw new Error(`Supabase program save failed: ${error.message}`);
    const result = data as
      | { kind: "saved"; version_id: string; revision: number }
      | { kind: "revision_conflict"; actual_revision: number };
    if (
      result.kind !== "saved" ||
      result.version_id !== version.id ||
      Number(result.revision) !== version.revision
    ) {
      throw new Error(
        result.kind === "revision_conflict"
          ? `Supabase revision conflict at revision ${result.actual_revision}.`
          : "Supabase returned an unexpected program version.",
      );
    }
  }

  async setActiveRuntimeVersion(workspaceId: string, versionId: string | undefined): Promise<void> {
    const { error } = await this.client
      .from("project_workspaces")
      .update({ active_runtime_version_id: versionId ?? null })
      .eq("id", workspaceId);
    if (error) throw new Error(`Supabase runtime status update failed: ${error.message}`);
  }

  private async upsert(table: string, row: Record<string, unknown>): Promise<void> {
    const { error } = await this.client.from(table).upsert(row);
    if (error) throw new Error(`Supabase ${table} write failed: ${error.message}`);
  }
}

export function createPrototypePersistenceFromEnvironment(): PrototypePersistence {
  if (process.env.BADGERBOTS_PROTOTYPE_PERSISTENCE !== "supabase")
    return new MemoryPrototypePersistence();
  const url = process.env.BB_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey)
    throw new Error(
      "Supabase prototype persistence requires BB_SUPABASE_URL (or PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
    );
  if (url.includes("127.0.0.1") && !url.startsWith("http://127.0.0.1"))
    throw new Error("The Supabase URL is invalid.");
  if (serviceRoleKey.startsWith("replace-with-"))
    throw new Error(
      "Replace the placeholder Supabase service-role key before enabling persistence.",
    );
  const client: unknown = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabasePrototypePersistence(client as PrototypeDatabaseClient);
}

function required<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`Prototype ${label} was not initialized.`);
  return value;
}
