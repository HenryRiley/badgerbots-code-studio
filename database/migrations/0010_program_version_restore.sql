begin;

-- Restore is recorded as a new immutable revision.  The source version is never
-- edited or deleted, so the timeline remains an auditable chain even when an
-- instructor rolls a student back to an earlier program.
create or replace function public.restore_program_version_v1(
  target_workspace_id uuid,
  source_version_id uuid,
  expected_revision bigint,
  version_author_id uuid,
  mutation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_workspace public.project_workspaces%rowtype;
  source_version public.program_versions%rowtype;
  existing_version public.program_versions%rowtype;
  created_version public.program_versions%rowtype;
begin
  select * into current_workspace
    from public.project_workspaces
    where id = target_workspace_id
    for update;
  if not found then raise exception 'workspace not found'; end if;

  -- A retry of the same request returns the original revision rather than
  -- creating another restore entry.
  select * into existing_version
    from public.program_versions
    where workspace_id = target_workspace_id
      and author_kind = 'instructor'
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

  select * into source_version
    from public.program_versions
    where id = source_version_id
      and workspace_id = target_workspace_id;
  if not found then raise exception 'source version not found'; end if;

  update public.project_workspaces
    set revision = revision + 1,
        canonical_program = source_version.canonical_program,
        updated_at = now()
    where id = target_workspace_id
    returning * into current_workspace;

  insert into public.program_versions(
    workspace_id,
    revision,
    canonical_program,
    author_kind,
    author_id,
    client_mutation_id,
    restored_from_version_id
  ) values (
    target_workspace_id,
    current_workspace.revision,
    source_version.canonical_program,
    'instructor',
    version_author_id,
    mutation_id,
    source_version.id
  ) returning * into created_version;

  return jsonb_build_object(
    'kind', 'saved',
    'version_id', created_version.id,
    'revision', created_version.revision
  );
end
$$;

revoke all on function public.restore_program_version_v1(uuid, uuid, bigint, uuid, uuid)
  from public;
grant execute on function public.restore_program_version_v1(uuid, uuid, bigint, uuid, uuid)
  to service_role;

commit;
