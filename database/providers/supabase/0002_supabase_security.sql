begin;

-- Apply after 0001 on Supabase. Public/anonymous clients receive no direct table grants.
revoke all on all tables in schema public from anon;
grant usage on schema public, app to authenticated;
grant select on public.organizations, public.locations, public.instructors, public.memberships,
  public.host_installations, public.sessions, public.session_instructors, public.devices,
  public.minecraft_mappings, public.campers, public.enrollments, public.project_workspaces,
  public.program_versions, public.progress_records, public.help_requests,
  public.connection_health, public.runtime_events, public.audit_records to authenticated;
grant execute on function public.bootstrap_owner(uuid, text, text, text) to service_role;
grant execute on function public.save_program_version(uuid, bigint, jsonb, text, uuid, uuid) to service_role;

-- Only compact authoritative row changes are published. Camper access remains behind
-- privileged join/autosave functions using opaque, hashed session credentials.
alter publication supabase_realtime add table public.project_workspaces;
alter publication supabase_realtime add table public.progress_records;
alter publication supabase_realtime add table public.help_requests;
alter publication supabase_realtime add table public.connection_health;
alter publication supabase_realtime add table public.runtime_events;

commit;
