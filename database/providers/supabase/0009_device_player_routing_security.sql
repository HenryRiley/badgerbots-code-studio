begin;

revoke all on function public.set_session_device_minecraft_mapping(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_session_device_minecraft_mapping(uuid, uuid, uuid, text)
  to service_role;

commit;
