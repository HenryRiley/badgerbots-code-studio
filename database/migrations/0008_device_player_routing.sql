begin;

alter table public.minecraft_mappings
  drop constraint if exists minecraft_mappings_organization_id_device_id_active_key;
alter table public.minecraft_mappings
  drop constraint if exists minecraft_mappings_organization_id_minecraft_username_active_key;

create unique index if not exists minecraft_mappings_one_active_device_idx
  on public.minecraft_mappings(organization_id, device_id)
  where active;
create unique index if not exists minecraft_mappings_one_active_username_idx
  on public.minecraft_mappings(organization_id, lower(minecraft_username))
  where active;

create index if not exists enrollments_session_device_idx
  on public.enrollments(session_id, device_id)
  where revoked_at is null;

create or replace function public.set_session_device_minecraft_mapping(
  requested_session_id uuid,
  requested_camper_id uuid,
  acting_instructor_id uuid,
  requested_minecraft_username text
) returns table(mapped_device_id uuid, mapping_organization_id uuid)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  selected_device_id uuid;
  selected_organization_id uuid;
begin
  if requested_minecraft_username !~ '^[A-Za-z0-9_]{3,16}$' then
    raise exception 'invalid_minecraft_username';
  end if;

  select enrollment.device_id, session.organization_id
    into selected_device_id, selected_organization_id
  from public.enrollments enrollment
  join public.sessions session on session.id = enrollment.session_id
  join public.session_instructors assignment
    on assignment.session_id = session.id
   and assignment.instructor_id = acting_instructor_id
  join public.devices device
    on device.id = enrollment.device_id
   and device.organization_id = session.organization_id
  where enrollment.session_id = requested_session_id
    and enrollment.camper_id = requested_camper_id
    and enrollment.revoked_at is null
  for update of enrollment;

  if selected_device_id is null then
    raise exception 'device_or_instructor_assignment_not_found';
  end if;

  update public.minecraft_mappings
  set active = false, retired_at = now()
  where organization_id = selected_organization_id
    and active
    and (
      device_id = selected_device_id
      or lower(minecraft_username) = lower(requested_minecraft_username)
    );

  insert into public.minecraft_mappings (
    organization_id,
    device_id,
    minecraft_username,
    mapped_by_instructor_id
  ) values (
    selected_organization_id,
    selected_device_id,
    requested_minecraft_username,
    acting_instructor_id
  );

  return query select selected_device_id, selected_organization_id;
end;
$$;

commit;
