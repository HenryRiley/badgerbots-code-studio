# Checkpoint 24 — collaboration and code history

Status: implementation complete locally; provider migration and two-device Windows evidence remain deployment gates.

Checkpoint 24 makes shared editing explicit and recoverable. A newer remote program never silently replaces a changed local draft. The editor presents two choices: use the incoming revision, or keep the local program as the next cloud version. The latter rebases the optimistic-concurrency cursor and records a normal immutable revision, so both programs remain in the timeline.

The classroom controls drawer now includes a version timeline. Each saved version shows its revision, actor kind, timestamp, and restore provenance. Instructors can preview the canonical program and restore a prior version. Restore creates a new version with `restored_from_version_id`; it does not automatically run the program. Students can preview history but cannot restore it.

## Implementation

- `workspace_versions` returns at most 50 authorized versions with canonical programs.
- `restore_program` is instructor/session-authorized and uses `restore_program_version_v1` for an atomic, idempotent restore.
- `database/migrations/0010_program_version_restore.sql` adds the restore transaction and service-role grant.
- Web conflict choices preserve local storage and update the displayed confirmation/status.
- Realtime and ten-second polling continue to provide the remote revision; a reconnect reconstructs the conflict from the durable workspace row.

## Verification

- `node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`
- `node_modules/.bin/vitest run apps/web/app/classroom/classroom-api.test.ts` (4 tests passed)
- `deno fmt --check` on classroom Edge files
- Full provider migration must be applied by the protected Supabase deployment workflow before live history/restore testing.

## Manual acceptance

1. Open the same student's `/editor` on a student browser and an assigned instructor browser.
2. Make and save a student change, then edit and save the instructor copy.
3. Confirm the student sees a conflict card and that their local blocks remain visible.
4. Choose **Use revision** and confirm the blocks update without an automatic Run.
5. Repeat the race and choose **Keep my work as a new version**; confirm the timeline contains both revisions.
6. Open the drawer on the instructor side, preview an older revision, restore it, and confirm a new `restored` revision appears. Verify Minecraft does not change until Run is pressed.
7. Refresh/reconnect during an unresolved conflict and confirm the same choice is presented; no acknowledged local work disappears.

The migration is intentionally not applied by local browser-only builds. Deploy the protected `Deploy Supabase production` workflow from a reviewed commit before using this slice with real accounts.
