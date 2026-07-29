-- TEST ENVIRONMENTS ONLY.
--
-- This removes every BadgerBots application row while preserving schemas, migrations,
-- functions, RLS policies, extensions, and Supabase project configuration.
--
-- Before running in Supabase SQL Editor, replace TYPE_CONFIRMATION_HERE with:
-- RESET_BADGERBOTS_TEST_PILOT
--
-- Auth users are intentionally not modified here. Delete them through
-- Supabase Dashboard > Authentication > Users after this transaction succeeds.

begin;

set local badgerbots.complete_pilot_reset_confirmation = 'TYPE_CONFIRMATION_HERE';

do $reset_guard$
begin
  if current_setting(
    'badgerbots.complete_pilot_reset_confirmation',
    true
  ) is distinct from 'RESET_BADGERBOTS_TEST_PILOT' then
    raise exception 'Complete pilot reset confirmation was not provided.';
  end if;
end
$reset_guard$;

truncate table
  public.classroom_commands,
  public.runtime_events,
  public.audit_records,
  public.connection_health,
  public.help_requests,
  public.progress_records,
  public.active_worlds,
  public.program_versions,
  public.project_workspaces,
  public.enrollments,
  public.campers,
  public.minecraft_mappings,
  public.devices,
  public.session_instructors,
  public.join_attempt_windows,
  public.sessions,
  public.host_installations,
  public.memberships,
  public.instructors,
  public.locations,
  public.curriculum_projects,
  public.curriculum_versions,
  public.world_template_versions,
  public.organizations,
  public.owner_bootstrap_state,
  public.prototype_lab_recovery
restart identity cascade;

commit;
