begin;

create extension if not exists pgcrypto;
create schema if not exists app;

create type public.instructor_role as enum ('owner', 'assistant');
create type public.session_retention_state as enum ('scheduled', 'active', 'hidden_recoverable', 'deletion_queued', 'deleted');
create type public.progress_state as enum ('not_started', 'working', 'complete', 'optional_extension', 'needs_attention');
create type public.help_state as enum ('open', 'acknowledged', 'resolved');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.instructors (
  id uuid primary key default gen_random_uuid(),
  auth_provider text not null default 'supabase',
  auth_subject uuid not null unique,
  normalized_email text not null unique,
  display_email text not null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null references public.organizations(id),
  instructor_id uuid not null references public.instructors(id),
  role public.instructor_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, instructor_id)
);

create table public.host_installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  location_id uuid not null references public.locations(id),
  display_name text not null,
  pairing_credential_digest text,
  credential_rotated_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, location_id, id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  location_id uuid not null references public.locations(id),
  owner_instructor_id uuid not null references public.instructors(id),
  track_id text not null,
  starts_on date not null,
  ends_on date not null,
  join_code_digest text not null unique,
  retention_state public.session_retention_state not null default 'scheduled',
  recoverable_until date,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (recoverable_until is null or recoverable_until >= ends_on)
);

create table public.join_attempt_windows (
  key_digest text primary key,
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count between 0 and 1000),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.session_instructors (
  session_id uuid not null references public.sessions(id),
  instructor_id uuid not null references public.instructors(id),
  role public.instructor_role not null,
  created_at timestamptz not null default now(),
  primary key (session_id, instructor_id)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  stable_device_public_id text not null,
  display_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (organization_id, stable_device_public_id)
);

create table public.minecraft_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  device_id uuid not null references public.devices(id),
  minecraft_account_reference text,
  minecraft_username text not null,
  mapped_by_instructor_id uuid not null references public.instructors(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  unique (organization_id, device_id, active),
  unique (organization_id, minecraft_username, active)
);

create table public.campers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id),
  first_name text not null check (char_length(first_name) between 1 and 40),
  last_initial text not null check (char_length(last_initial) = 1),
  access_credential_digest text not null,
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id),
  camper_id uuid not null references public.campers(id),
  device_id uuid references public.devices(id),
  joined_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (session_id, camper_id)
);

create table public.curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  track_id text not null,
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'published', 'retired')),
  source_provenance text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  unique (organization_id, track_id, version)
);

create table public.curriculum_projects (
  id uuid primary key default gen_random_uuid(),
  curriculum_version_id uuid not null references public.curriculum_versions(id),
  project_key text not null,
  day_number integer not null check (day_number > 0),
  data jsonb not null,
  unique (curriculum_version_id, project_key)
);

create table public.world_template_versions (
  id uuid primary key default gen_random_uuid(),
  project_key text not null,
  version integer not null check (version > 0),
  minecraft_version text not null,
  checksum_sha256 text not null,
  license_provenance jsonb not null,
  metadata jsonb not null,
  unique (project_key, version)
);

create table public.active_worlds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id),
  camper_id uuid references public.campers(id),
  host_installation_id uuid not null references public.host_installations(id),
  template_version_id uuid not null references public.world_template_versions(id),
  lifecycle_state text not null check (lifecycle_state in ('pending', 'loaded', 'unloading', 'unloaded', 'resetting', 'failed')),
  created_at timestamptz not null default now(),
  unique (session_id, camper_id)
);

create table public.project_workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  session_id uuid not null references public.sessions(id),
  camper_id uuid references public.campers(id),
  project_key text not null,
  revision bigint not null default 0 check (revision >= 0),
  canonical_program jsonb not null,
  active_runtime_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, camper_id, project_key)
);

create table public.program_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.project_workspaces(id),
  revision bigint not null check (revision > 0),
  canonical_program jsonb not null,
  author_kind text not null check (author_kind in ('camper', 'instructor')),
  author_id uuid not null,
  client_mutation_id uuid not null,
  restored_from_version_id uuid references public.program_versions(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, revision),
  unique (workspace_id, author_kind, author_id, client_mutation_id)
);

alter table public.project_workspaces
  add constraint project_workspaces_active_runtime_version_fk
  foreign key (active_runtime_version_id) references public.program_versions(id);

create table public.progress_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id),
  camper_id uuid not null references public.campers(id),
  project_key text not null,
  benchmark_key text not null,
  state public.progress_state not null,
  evidence jsonb not null default '{}'::jsonb,
  decided_by_instructor_id uuid references public.instructors(id),
  observed_at timestamptz not null default now(),
  unique (session_id, camper_id, project_key, benchmark_key)
);

create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id),
  camper_id uuid not null references public.campers(id),
  state public.help_state not null default 'open',
  summary text check (char_length(summary) <= 240),
  created_at timestamptz not null default now(),
  acknowledged_by_instructor_id uuid references public.instructors(id),
  resolved_at timestamptz
);

create table public.connection_health (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  session_id uuid references public.sessions(id),
  subject_kind text not null check (subject_kind in ('host', 'device', 'camper_web', 'minecraft')),
  subject_id uuid not null,
  state text not null check (state in ('offline', 'connecting', 'online', 'stale', 'warning', 'error')),
  summary jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  unique (subject_kind, subject_id)
);

create table public.runtime_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  session_id uuid not null references public.sessions(id),
  workspace_id uuid references public.project_workspaces(id),
  severity text not null check (severity in ('info', 'warning', 'error')),
  event_type text not null,
  redacted_payload jsonb not null default '{}'::jsonb,
  correlation_id uuid not null,
  occurred_at timestamptz not null default now()
);

create table public.audit_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  session_id uuid references public.sessions(id),
  actor_kind text not null check (actor_kind in ('system', 'instructor', 'camper', 'host')),
  actor_id uuid,
  action text not null,
  target_kind text not null,
  target_id uuid not null,
  correlation_id uuid not null,
  redacted_context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index memberships_instructor_idx on public.memberships(instructor_id, organization_id);
create index sessions_location_dates_idx on public.sessions(location_id, starts_on, ends_on);
create index sessions_retention_idx on public.sessions(retention_state, recoverable_until);
create index campers_session_idx on public.campers(session_id);
create index workspaces_session_idx on public.project_workspaces(session_id, camper_id);
create index versions_workspace_created_idx on public.program_versions(workspace_id, revision desc);
create index runtime_events_session_time_idx on public.runtime_events(session_id, occurred_at desc);
create index audit_org_time_idx on public.audit_records(organization_id, occurred_at desc);

create function app.current_auth_subject() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create function app.current_instructor_id() returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select id from public.instructors where auth_subject = app.current_auth_subject()
$$;

create function app.is_org_member(target_organization_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = target_organization_id
      and instructor_id = app.current_instructor_id()
  )
$$;

create function app.is_session_instructor(target_session_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.session_instructors
    where session_id = target_session_id
      and instructor_id = app.current_instructor_id()
  )
$$;

create function app.is_session_owner(target_session_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sessions
    where id = target_session_id
      and owner_instructor_id = app.current_instructor_id()
  )
$$;

create function public.bootstrap_owner(
  owner_auth_subject uuid,
  owner_email text,
  organization_name text,
  location_name text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  new_organization_id uuid;
  new_location_id uuid;
  new_instructor_id uuid;
begin
  lock table public.instructors in exclusive mode;
  if exists (select 1 from public.instructors) then
    raise exception 'initial owner bootstrap has already been used';
  end if;
  insert into public.organizations(name) values (organization_name) returning id into new_organization_id;
  insert into public.locations(organization_id, name)
    values (new_organization_id, location_name) returning id into new_location_id;
  insert into public.instructors(auth_subject, normalized_email, display_email)
    values (owner_auth_subject, lower(trim(owner_email)), trim(owner_email)) returning id into new_instructor_id;
  insert into public.memberships(organization_id, instructor_id, role)
    values (new_organization_id, new_instructor_id, 'owner');
  return jsonb_build_object(
    'organization_id', new_organization_id,
    'location_id', new_location_id,
    'instructor_id', new_instructor_id
  );
end
$$;
revoke all on function public.bootstrap_owner(uuid, text, text, text) from public;

create function public.save_program_version(
  target_workspace_id uuid,
  expected_revision bigint,
  next_program jsonb,
  version_author_kind text,
  version_author_id uuid,
  mutation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_workspace public.project_workspaces%rowtype;
  existing_version public.program_versions%rowtype;
  created_version public.program_versions%rowtype;
begin
  select * into current_workspace
    from public.project_workspaces
    where id = target_workspace_id
    for update;
  if not found then raise exception 'workspace not found'; end if;

  -- Serialize retries with the workspace lock before checking idempotency. Two
  -- simultaneous deliveries of the same mutation therefore return one version.
  select * into existing_version
    from public.program_versions
    where workspace_id = target_workspace_id
      and author_kind = version_author_kind
      and author_id = version_author_id
      and client_mutation_id = mutation_id;
  if found then
    return jsonb_build_object('kind', 'saved', 'version_id', existing_version.id, 'revision', existing_version.revision);
  end if;

  if current_workspace.revision <> expected_revision then
    return jsonb_build_object(
      'kind', 'revision_conflict',
      'expected_revision', expected_revision,
      'actual_revision', current_workspace.revision,
      'latest', current_workspace.canonical_program
    );
  end if;

  update public.project_workspaces
    set revision = revision + 1, canonical_program = next_program, updated_at = now()
    where id = target_workspace_id
    returning * into current_workspace;
  insert into public.program_versions(
    workspace_id, revision, canonical_program, author_kind, author_id, client_mutation_id
  ) values (
    target_workspace_id, current_workspace.revision, next_program,
    version_author_kind, version_author_id, mutation_id
  ) returning * into created_version;
  return jsonb_build_object('kind', 'saved', 'version_id', created_version.id, 'revision', created_version.revision);
end
$$;
revoke all on function public.save_program_version(uuid, bigint, jsonb, text, uuid, uuid) from public;

alter table public.organizations enable row level security;
alter table public.locations enable row level security;
alter table public.instructors enable row level security;
alter table public.memberships enable row level security;
alter table public.host_installations enable row level security;
alter table public.sessions enable row level security;
alter table public.join_attempt_windows enable row level security;
alter table public.session_instructors enable row level security;
alter table public.devices enable row level security;
alter table public.minecraft_mappings enable row level security;
alter table public.campers enable row level security;
alter table public.enrollments enable row level security;
alter table public.project_workspaces enable row level security;
alter table public.program_versions enable row level security;
alter table public.progress_records enable row level security;
alter table public.help_requests enable row level security;
alter table public.connection_health enable row level security;
alter table public.runtime_events enable row level security;
alter table public.audit_records enable row level security;
alter table public.curriculum_versions enable row level security;
alter table public.curriculum_projects enable row level security;
alter table public.world_template_versions enable row level security;
alter table public.active_worlds enable row level security;

create policy organizations_member_select on public.organizations for select using (app.is_org_member(id));
create policy locations_member_select on public.locations for select using (app.is_org_member(organization_id));
create policy instructors_self_select on public.instructors for select using (id = app.current_instructor_id());
create policy memberships_org_select on public.memberships for select using (app.is_org_member(organization_id));
create policy hosts_org_select on public.host_installations for select using (app.is_org_member(organization_id));
create policy sessions_org_select on public.sessions for select using (app.is_org_member(organization_id));
create policy sessions_owner_mutate on public.sessions for all using (app.is_session_owner(id)) with check (app.is_org_member(organization_id));
create policy session_instructors_select on public.session_instructors for select using (app.is_session_instructor(session_id));
create policy devices_org_select on public.devices for select using (app.is_org_member(organization_id));
create policy mappings_org_select on public.minecraft_mappings for select using (app.is_org_member(organization_id));
create policy campers_session_staff_select on public.campers for select using (app.is_session_instructor(session_id));
create policy enrollments_session_staff_select on public.enrollments for select using (app.is_session_instructor(session_id));
create policy workspaces_session_staff_select on public.project_workspaces for select using (app.is_session_instructor(session_id));
create policy workspaces_session_staff_update on public.project_workspaces for update using (app.is_session_instructor(session_id)) with check (app.is_session_instructor(session_id));
create policy versions_session_staff_select on public.program_versions for select using (
  exists (select 1 from public.project_workspaces w where w.id = workspace_id and app.is_session_instructor(w.session_id))
);
create policy progress_session_staff_select on public.progress_records for select using (app.is_session_instructor(session_id));
create policy help_session_staff_select on public.help_requests for select using (app.is_session_instructor(session_id));
create policy health_org_select on public.connection_health for select using (app.is_org_member(organization_id));
create policy runtime_events_org_select on public.runtime_events for select using (app.is_org_member(organization_id));
create policy audits_org_select on public.audit_records for select using (app.is_org_member(organization_id));
create policy active_worlds_session_staff_select on public.active_worlds for select using (app.is_session_instructor(session_id));

commit;
