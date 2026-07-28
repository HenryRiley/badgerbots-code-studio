import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

describe("portable control-plane migration", () => {
  it("defines every minimum lifecycle table with opaque primary keys", async () => {
    const sql = await readFile(
      resolve(root, "database/migrations/0001_control_plane_core.sql"),
      "utf8",
    );
    const tables = [
      "organizations",
      "locations",
      "instructors",
      "memberships",
      "host_installations",
      "sessions",
      "session_instructors",
      "join_attempt_windows",
      "devices",
      "minecraft_mappings",
      "campers",
      "enrollments",
      "curriculum_versions",
      "curriculum_projects",
      "world_template_versions",
      "active_worlds",
      "project_workspaces",
      "program_versions",
      "progress_records",
      "help_requests",
      "connection_health",
      "runtime_events",
      "audit_records",
    ];
    const relationshipTables = new Set([
      "memberships",
      "session_instructors",
      "join_attempt_windows",
    ]);
    for (const table of tables.filter((name) => !relationshipTables.has(name))) {
      expect(sql).toContain(`create table public.${table}`);
      const tableDefinition = sql.split(`create table public.${table} (`)[1]?.split("\n);")[0];
      expect(tableDefinition, `${table} definition`).toContain("id uuid primary key");
    }
    expect(sql).toContain("create table public.join_attempt_windows");
    expect(sql).toContain("key_digest text primary key");
    expect(sql).toContain("primary key (organization_id, instructor_id)");
    expect(sql).toContain("primary key (session_id, instructor_id)");
    expect(sql).not.toMatch(/minecraft_username\s+[^,]*primary key/i);
    expect(sql).not.toMatch(/first_name\s+[^,]*primary key/i);
  });

  it("hashes short credentials and enables RLS on exposed child/session tables", async () => {
    const sql = await readFile(
      resolve(root, "database/migrations/0001_control_plane_core.sql"),
      "utf8",
    );
    expect(sql).toContain("join_code_digest text not null unique");
    expect(sql).not.toMatch(/join_code\s+text/i);
    expect(sql).toContain("access_credential_digest text not null");
    expect(sql).toContain("for update;");
    expect(sql.indexOf("for update;")).toBeLessThan(
      sql.indexOf("where workspace_id = target_workspace_id"),
    );
    expect(sql).toContain("'kind', 'revision_conflict'");
    for (const table of [
      "sessions",
      "campers",
      "enrollments",
      "project_workspaces",
      "program_versions",
      "runtime_events",
      "audit_records",
    ])
      expect(sql).toContain(`alter table public.${table} enable row level security`);
  });

  it("keeps anonymous access revoked in the Supabase overlay", async () => {
    const sql = await readFile(
      resolve(root, "database/providers/supabase/0002_supabase_security.sql"),
      "utf8",
    );
    expect(sql).toContain("revoke all on all tables in schema public from anon");
    expect(sql).toContain("grant execute on function public.bootstrap_owner");
    expect(sql).not.toContain("grant select on public.campers to anon");
  });

  it("atomically saves caller-generated version UUIDs for database-backed prototypes", async () => {
    const sql = await readFile(
      resolve(root, "database/migrations/0003_atomic_program_version_ids.sql"),
      "utf8",
    );
    expect(sql).toContain("create function public.save_program_version_v2");
    expect(sql).toContain("created_version_id uuid");
    expect(sql).toContain("for update;");
    expect(sql).toContain("id, workspace_id, revision");
    expect(sql).toContain("grant execute on function public.save_program_version_v2");
  });

  it("keeps short-lived prototype recovery encrypted and service-role only", async () => {
    const sql = await readFile(
      resolve(root, "database/migrations/0004_prototype_lab_recovery.sql"),
      "utf8",
    );
    expect(sql).toContain("create table public.prototype_lab_recovery");
    expect(sql).toContain("encrypted_payload text not null");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.prototype_lab_recovery from anon, authenticated");
    expect(sql).toContain("recovery_expires_at > now() + interval '5 hours'");
    expect(sql).toContain("grant execute on function public.load_prototype_lab_recovery");
  });

  it("adds private camper realtime identity and a durable outbound Host queue", async () => {
    const core = await readFile(
      resolve(root, "database/migrations/0005_connected_classroom.sql"),
      "utf8",
    );
    const security = await readFile(
      resolve(root, "database/providers/supabase/0006_connected_classroom_security.sql"),
      "utf8",
    );
    expect(core).toContain("add column auth_subject uuid unique");
    expect(core).toContain("create table public.classroom_commands");
    expect(core).toContain("create table public.owner_bootstrap_state");
    expect(core).toContain("normalized_email not like 'prototype-%@invalid.example'");
    expect(core).toContain("unique (host_installation_id, sequence)");
    expect(core).toContain("for update skip locked");
    expect(core).toContain("record_failed_classroom_join");
    expect(core).toContain("alter table public.classroom_commands enable row level security");
    expect(core).not.toContain("pairing_credential_ciphertext");
    expect(security).toContain("create function app.current_camper_id()");
    expect(security).toContain("create policy workspaces_camper_select");
    expect(security).not.toContain("grant select on public.sessions to anon");
    expect(security).toContain(
      "alter publication supabase_realtime add table public.classroom_commands",
    );
  });

  it("recovers only a confirmed replacement for a deleted instructor identity", async () => {
    const sql = await readFile(
      resolve(root, "database/providers/supabase/0007_instructor_identity_recovery.sql"),
      "utf8",
    );
    expect(sql).toContain("create or replace function public.rebind_deleted_instructor_identity");
    expect(sql).toContain("email_confirmed_at is not null");
    expect(sql).toContain("where id = prior_auth_subject");
    expect(sql).toContain("raise exception 'prior auth identity still exists'");
    expect(sql).toContain("'instructor_auth_subject_rebound'");
    expect(sql).toContain("revoke all on function public.rebind_deleted_instructor_identity");
    expect(sql).toContain("to service_role");
    expect(sql).not.toContain(
      "grant execute on function public.rebind_deleted_instructor_identity(uuid, text) to authenticated",
    );
  });

  it("deploys cloud changes centrally without placing admin secrets in installers", async () => {
    const workflow = await readFile(resolve(root, ".github/workflows/deploy-supabase.yml"), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("secrets.SUPABASE_ACCESS_TOKEN");
    expect(workflow).toContain("secrets.SUPABASE_DB_URL");
    expect(workflow).toContain("secrets.SUPABASE_PROJECT_REF");
    expect(workflow).toContain("0007_instructor_identity_recovery.sql");
    expect(workflow).toContain("functions deploy classroom-api");
    expect(workflow).not.toContain("VITE_BADGERBOTS_SUPABASE_SECRET");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
