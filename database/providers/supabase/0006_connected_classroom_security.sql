begin;

create function app.current_camper_id() returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select id from public.campers where auth_subject = app.current_auth_subject()
$$;

create function app.is_workspace_camper(target_workspace_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.project_workspaces
    where id = target_workspace_id
      and camper_id = app.current_camper_id()
      and exists (
        select 1 from public.sessions
        where sessions.id = project_workspaces.session_id
          and sessions.retention_state = 'active'
          and current_date between sessions.starts_on and sessions.ends_on
      )
  )
$$;

create policy campers_self_select on public.campers for select
  using (id = app.current_camper_id() and hidden_at is null);
create policy workspaces_camper_select on public.project_workspaces for select
  using (camper_id = app.current_camper_id() and app.is_workspace_camper(id));
create policy versions_camper_select on public.program_versions for select
  using (app.is_workspace_camper(workspace_id));
create policy help_camper_select on public.help_requests for select
  using (camper_id = app.current_camper_id());
create policy commands_session_staff_select on public.classroom_commands for select
  using (app.is_session_instructor(session_id));
create policy health_camper_insert on public.connection_health for insert
  with check (
    subject_kind = 'camper_web'
    and subject_id = app.current_camper_id()
    and exists (
      select 1 from public.campers
      join public.sessions on sessions.id = campers.session_id
      where campers.id = app.current_camper_id()
        and sessions.id = connection_health.session_id
        and sessions.organization_id = connection_health.organization_id
        and sessions.retention_state = 'active'
        and current_date between sessions.starts_on and sessions.ends_on
    )
  );
create policy health_camper_update on public.connection_health for update
  using (subject_kind = 'camper_web' and subject_id = app.current_camper_id())
  with check (
    subject_kind = 'camper_web'
    and subject_id = app.current_camper_id()
    and exists (
      select 1 from public.campers
      join public.sessions on sessions.id = campers.session_id
      where campers.id = app.current_camper_id()
        and sessions.id = connection_health.session_id
        and sessions.organization_id = connection_health.organization_id
        and sessions.retention_state = 'active'
        and current_date between sessions.starts_on and sessions.ends_on
    )
  );

grant select on public.campers, public.project_workspaces, public.program_versions,
  public.help_requests, public.classroom_commands to authenticated;
grant insert, update on public.connection_health to authenticated;

alter publication supabase_realtime add table public.classroom_commands;

commit;
