begin;

create table public.prototype_lab_recovery (
  token_digest text primary key check (token_digest ~ '^[0-9a-f]{64}$'),
  encrypted_payload text not null check (char_length(encrypted_payload) between 32 and 1048576),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.prototype_lab_recovery enable row level security;
revoke all on public.prototype_lab_recovery from anon, authenticated;

create function public.save_prototype_lab_recovery(
  recovery_token_digest text,
  recovery_encrypted_payload text,
  recovery_expires_at timestamptz
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if recovery_expires_at <= now() or recovery_expires_at > now() + interval '5 hours' then
    raise exception 'prototype recovery expiration is outside the allowed window';
  end if;
  insert into public.prototype_lab_recovery(
    token_digest, encrypted_payload, expires_at, updated_at
  ) values (
    recovery_token_digest, recovery_encrypted_payload, recovery_expires_at, now()
  )
  on conflict (token_digest) do update
    set encrypted_payload = excluded.encrypted_payload,
        expires_at = excluded.expires_at,
        updated_at = now();
  delete from public.prototype_lab_recovery where expires_at <= now();
end
$$;

create function public.load_prototype_lab_recovery(
  recovery_token_digest text
) returns text
language sql security definer set search_path = public, pg_temp
as $$
  select encrypted_payload
  from public.prototype_lab_recovery
  where token_digest = recovery_token_digest
    and expires_at > now()
$$;

revoke all on function public.save_prototype_lab_recovery(text, text, timestamptz) from public;
revoke all on function public.load_prototype_lab_recovery(text) from public;
grant execute on function public.save_prototype_lab_recovery(text, text, timestamptz)
  to service_role;
grant execute on function public.load_prototype_lab_recovery(text)
  to service_role;

commit;
