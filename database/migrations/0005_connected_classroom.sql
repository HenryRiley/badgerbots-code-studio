begin;

alter table public.campers
  add column auth_subject uuid unique;

alter table public.host_installations
  add column command_sequence bigint not null default 0 check (command_sequence >= 0);

create table public.owner_bootstrap_state (
  singleton boolean primary key default true check (singleton),
  used_at timestamptz not null,
  auth_subject uuid not null
);

insert into public.owner_bootstrap_state(singleton, used_at, auth_subject)
select true, created_at, auth_subject
from public.instructors
where normalized_email not like 'prototype-%@invalid.example'
order by created_at
limit 1;

create or replace function public.bootstrap_owner(
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
  lock table public.owner_bootstrap_state in exclusive mode;
  if exists (select 1 from public.owner_bootstrap_state where singleton) then
    raise exception 'initial owner bootstrap has already been used';
  end if;
  insert into public.organizations(name)
    values (organization_name) returning id into new_organization_id;
  insert into public.locations(organization_id, name)
    values (new_organization_id, location_name) returning id into new_location_id;
  insert into public.instructors(auth_subject, normalized_email, display_email)
    values (owner_auth_subject, lower(trim(owner_email)), trim(owner_email))
    returning id into new_instructor_id;
  insert into public.memberships(organization_id, instructor_id, role)
    values (new_organization_id, new_instructor_id, 'owner');
  insert into public.owner_bootstrap_state(singleton, used_at, auth_subject)
    values (true, now(), owner_auth_subject);
  return jsonb_build_object(
    'organization_id', new_organization_id,
    'location_id', new_location_id,
    'instructor_id', new_instructor_id
  );
end
$$;
revoke all on function public.bootstrap_owner(uuid, text, text, text) from public;
grant execute on function public.bootstrap_owner(uuid, text, text, text) to service_role;

create table public.classroom_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  location_id uuid not null references public.locations(id),
  session_id uuid not null references public.sessions(id),
  host_installation_id uuid not null references public.host_installations(id),
  workspace_id uuid not null references public.project_workspaces(id),
  sequence bigint not null check (sequence >= 0),
  command_kind text not null check (command_kind in ('deploy_program', 'stop_program')),
  command_payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'delivering', 'accepted', 'rejected', 'expired')),
  created_by_kind text not null check (created_by_kind in ('camper', 'instructor')),
  created_by_id uuid not null,
  correlation_id uuid not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  acknowledged_at timestamptz,
  acknowledgement_code text,
  active_runtime_version_id uuid references public.program_versions(id),
  unique (host_installation_id, sequence),
  check (expires_at > issued_at),
  check (expires_at <= issued_at + interval '5 minutes')
);

create index classroom_commands_host_pending_idx
  on public.classroom_commands(host_installation_id, status, sequence);
create index classroom_commands_session_time_idx
  on public.classroom_commands(session_id, issued_at desc);

create function public.next_classroom_command_sequence(target_host_id uuid)
returns bigint
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  next_sequence bigint;
begin
  update public.host_installations
    set command_sequence = command_sequence + 1
    where id = target_host_id
    returning command_sequence into next_sequence;
  if not found then raise exception 'host installation not found'; end if;
  return next_sequence;
end
$$;

create function public.claim_next_classroom_command(target_host_id uuid)
returns setof public.classroom_commands
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  selected_id uuid;
begin
  update public.classroom_commands
    set status = 'expired', acknowledged_at = now(), acknowledgement_code = 'expired_before_delivery'
    where host_installation_id = target_host_id
      and status in ('pending', 'delivering')
      and expires_at <= now();

  select id into selected_id
  from public.classroom_commands
  where host_installation_id = target_host_id
    and (
      status = 'pending'
      or (status = 'delivering' and claimed_at <= now() - interval '10 seconds')
    )
    and expires_at > now()
  order by sequence
  for update skip locked
  limit 1;

  if selected_id is null then return; end if;

  return query
  update public.classroom_commands
    set status = 'delivering', claimed_at = now()
    where id = selected_id
    returning *;
end
$$;

create function public.record_failed_classroom_join(
  attempt_key_digest text,
  attempt_limit integer default 5
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_attempt public.join_attempt_windows%rowtype;
begin
  insert into public.join_attempt_windows(
    key_digest, window_started_at, attempt_count, updated_at
  ) values (
    attempt_key_digest, now(), 1, now()
  )
  on conflict (key_digest) do update
    set window_started_at = case
          when public.join_attempt_windows.window_started_at <= now() - interval '10 minutes'
            then now()
          else public.join_attempt_windows.window_started_at
        end,
        attempt_count = case
          when public.join_attempt_windows.window_started_at <= now() - interval '10 minutes'
            then 1
          else public.join_attempt_windows.attempt_count + 1
        end,
        blocked_until = case
          when (
            case
              when public.join_attempt_windows.window_started_at <= now() - interval '10 minutes'
                then 1
              else public.join_attempt_windows.attempt_count + 1
            end
          ) >= attempt_limit then now() + interval '15 minutes'
          else public.join_attempt_windows.blocked_until
        end,
        updated_at = now()
  returning * into current_attempt;

  return jsonb_build_object(
    'blocked', current_attempt.blocked_until is not null and current_attempt.blocked_until > now(),
    'attempt_count', current_attempt.attempt_count
  );
end
$$;

revoke all on function public.next_classroom_command_sequence(uuid) from public;
revoke all on function public.claim_next_classroom_command(uuid) from public;
revoke all on function public.record_failed_classroom_join(text, integer) from public;
grant execute on function public.next_classroom_command_sequence(uuid) to service_role;
grant execute on function public.claim_next_classroom_command(uuid) to service_role;
grant execute on function public.record_failed_classroom_join(text, integer) to service_role;

alter table public.classroom_commands enable row level security;
alter table public.owner_bootstrap_state enable row level security;

commit;
