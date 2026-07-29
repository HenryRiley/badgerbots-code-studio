begin;

create or replace function public.rebind_deleted_instructor_identity(
  next_auth_subject uuid,
  confirmed_email text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  matched_instructor_id uuid;
  prior_auth_subject uuid;
begin
  if confirmed_email is null
    or char_length(trim(confirmed_email)) > 200
    or lower(trim(confirmed_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then
    raise exception 'a confirmed instructor email is required';
  end if;

  select id, auth_subject
    into matched_instructor_id, prior_auth_subject
    from public.instructors
    where normalized_email = lower(trim(confirmed_email))
    for update;

  if matched_instructor_id is null then
    raise exception 'instructor email is not provisioned';
  end if;

  if prior_auth_subject = next_auth_subject then
    return matched_instructor_id;
  end if;

  if exists (
    select 1
    from public.instructors
    where auth_subject = next_auth_subject
  ) then
    raise exception 'new auth subject is already assigned';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = next_auth_subject
      and lower(email) = lower(trim(confirmed_email))
      and email_confirmed_at is not null
  ) then
    raise exception 'new auth identity is not confirmed';
  end if;

  if exists (
    select 1
    from auth.users
    where id = prior_auth_subject
  ) then
    raise exception 'prior auth identity still exists';
  end if;

  update public.instructors
    set auth_subject = next_auth_subject,
        display_email = trim(confirmed_email)
    where id = matched_instructor_id
      and auth_subject = prior_auth_subject;

  if not found then
    raise exception 'instructor identity changed concurrently';
  end if;

  insert into public.audit_records(
    organization_id,
    session_id,
    actor_kind,
    actor_id,
    action,
    target_kind,
    target_id,
    correlation_id,
    redacted_context
  )
  select
    memberships.organization_id,
    null,
    'system',
    matched_instructor_id,
    'instructor_auth_subject_rebound',
    'instructor',
    matched_instructor_id,
    gen_random_uuid(),
    jsonb_build_object('reason', 'confirmed_email_prior_identity_deleted')
  from public.memberships
  where memberships.instructor_id = matched_instructor_id;

  return matched_instructor_id;
end
$$;

revoke all on function public.rebind_deleted_instructor_identity(uuid, text)
  from public, anon, authenticated;
grant execute on function public.rebind_deleted_instructor_identity(uuid, text)
  to service_role;

commit;
