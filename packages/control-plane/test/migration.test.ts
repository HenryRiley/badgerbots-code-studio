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
});
