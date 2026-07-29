-- Run only after:
-- 1. complete-test-pilot-reset.sql succeeded;
-- 2. every old user was deleted in Supabase Authentication > Users; and
-- 3. exactly one new, confirmed instructor user was created in that dashboard.
--
-- Replace all three REPLACE_... values before running.
-- The password is never entered into SQL.

begin;

do $bootstrap$
declare
  owner_email constant text := 'REPLACE_WITH_NEW_OWNER_EMAIL';
  organization_name constant text := 'REPLACE_WITH_ORGANIZATION_NAME';
  location_name constant text := 'REPLACE_WITH_LOCATION_NAME';
  active_auth_user_count integer;
  owner_auth_subject uuid;
begin
  if owner_email = 'REPLACE_WITH_NEW_OWNER_EMAIL'
    or organization_name = 'REPLACE_WITH_ORGANIZATION_NAME'
    or location_name = 'REPLACE_WITH_LOCATION_NAME'
  then
    raise exception 'Replace the owner email, organization, and location placeholders first.';
  end if;

  select count(*)
    into active_auth_user_count
    from auth.users
    where deleted_at is null;

  if active_auth_user_count <> 1 then
    raise exception 'Exactly one active Auth user is required; found %.', active_auth_user_count;
  end if;

  select id
    into owner_auth_subject
    from auth.users
    where deleted_at is null
      and email_confirmed_at is not null
      and lower(email) = lower(trim(owner_email));

  if owner_auth_subject is null then
    raise exception 'The single Auth user does not have the confirmed owner email.';
  end if;

  perform public.bootstrap_owner(
    owner_auth_subject,
    owner_email,
    organization_name,
    location_name
  );
end
$bootstrap$;

commit;
