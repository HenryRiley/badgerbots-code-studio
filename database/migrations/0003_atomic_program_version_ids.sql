begin;

create function public.save_program_version_v2(
  target_workspace_id uuid,
  expected_revision bigint,
  next_program jsonb,
  created_version_id uuid,
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

  select * into existing_version
    from public.program_versions
    where workspace_id = target_workspace_id
      and author_kind = version_author_kind
      and author_id = version_author_id
      and client_mutation_id = mutation_id;
  if found then
    return jsonb_build_object(
      'kind', 'saved',
      'version_id', existing_version.id,
      'revision', existing_version.revision
    );
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
    id, workspace_id, revision, canonical_program, author_kind, author_id, client_mutation_id
  ) values (
    created_version_id, target_workspace_id, current_workspace.revision, next_program,
    version_author_kind, version_author_id, mutation_id
  ) returning * into created_version;
  return jsonb_build_object(
    'kind', 'saved',
    'version_id', created_version.id,
    'revision', created_version.revision
  );
end
$$;

revoke all on function public.save_program_version_v2(
  uuid, bigint, jsonb, uuid, text, uuid, uuid
) from public;
grant execute on function public.save_program_version_v2(
  uuid, bigint, jsonb, uuid, text, uuid, uuid
) to service_role;

commit;
