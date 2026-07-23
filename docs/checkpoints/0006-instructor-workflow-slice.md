# Checkpoint 6: instructor workflow slice

Status: first authorization-tested domain slice implemented on 2026-07-23.
Checkpoint 6 acceptance is not claimed.

## Genuinely working

- Browser autosave now hydrates before writing, flushes pending Blockly edits before tab
  changes/page hide, and reports storage failures instead of displaying a false
  acknowledgement.
- The browser stores a non-authoritative Blockly visual draft for each script alongside the
  canonical AST. Loose or incomplete blocks survive refresh while validation and execution
  continue to use only the last valid canonical program.
- A camper with a valid session access token can create one active help request.
- Repeated clicks do not flood the queue with duplicate open requests.
- The session owner or an assigned assistant can acknowledge or resolve help.
- Assigned instructors can upsert tolerant progress states with compact evidence.
- An authorized instructor can read a minimal roster projection containing the camper's
  first name and last initial, workspace revision, project, progress, and active help state.
- Help and progress changes publish content-free realtime hints and auditable actions.
- Cross-session instructors are refused.
- Session purge now removes help and progress data with the temporary camper records.

The PostgreSQL tables for help requests and progress already existed in migration
`0001_control_plane_core.sql`; this slice adds provider-neutral service behavior and
does not add a migration.

## Automated evidence

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/control-plane test
npx --yes pnpm@11.16.0 --filter @badgerbots/control-plane typecheck
npx --yes pnpm@11.16.0 --filter @badgerbots/web build
```

Focused result: 17 control-plane tests pass, including help deduplication,
acknowledgement/resolution, progress upsert, minimal roster output, and tenant/session
denial. The production web build also passes with the dependency-alert remediation.
Five web storage tests cover program/draft round trips, migration of the previous
program-only save, corrupt data preservation, failed-write reporting, and storage-key
compatibility. Manual browser verification covered loose action-block persistence across
refresh, rapid script-tab switching, and rendering the completed connected-action fixture.

## Not yet working

- No instructor dashboard UI is wired to these services.
- No live Supabase project or Postgres integration test has run.
- Connection state, Minecraft state, runtime warnings, visitor flow, world restore,
  operator controls, and remote Run are not integrated.
- Host, Connect, Web, and Paper are not connected end to end.
- The Sheep City world is metadata only and cannot yet be entered in Minecraft.
- Physical Windows/Paper acceptance remains pending.

## Security and privacy

- Roster output omits access tokens, legal surnames, and program content.
- Help summaries are limited to 240 characters.
- Help/progress reads and changes require assignment to the exact session.
- Realtime messages remain hints only; clients must re-fetch authorized state.

## Next slice

Implement the provider adapter and authenticated instructor dashboard for roster,
help, progress, and optimistic program snapshots. Then connect Host runtime status
through the signed outbound protocol before exposing operator controls.
