# Code Studio Web

Checkpoint 1 provides a statically exportable Next.js browser compiler harness. It renders the real Blockly Sheep City subset, keeps the complete implemented library searchable, exposes Player/Game/Sheep tabs, immediately acknowledges local saves, and gives a locally enabled instructor-only view of the restricted Java-style representation. Parse and validation results are shown in a compiler console.

The harness is deliberately labelled browser-only: Run produces an instruction-graph preview and never claims a Minecraft connection. Cloud identity, durable autosave/conflicts, dashboards, host status, and remote troubleshooting begin in later checkpoints.

Checkpoint 8 adds `/curriculum`, a clearly labelled in-memory instructor authoring lab. Draft
save, immutable revision history, review/reopen, duplication, preview, and publication validation
work locally. Publication intentionally fails while the source PDF and original world remain
unverified. It is not an authenticated dashboard or cloud-backed curriculum store.

Checkpoint 9 adds `/prototype`, which calls the separate loopback prototype control plane. It can
create a one-day session, join a minimal camper, synchronize the editor's last runnable canonical
program, deploy it through the signed Host protocol, execute attributed headless Sheep City events,
prove a bad replacement retains the last good version, and stop the execution scope. The page
explicitly does not claim a real Paper connection.

Do not implement direct browser-to-teacher-host networking. The host maintains an authenticated outbound connection to the cloud control plane; Minecraft clients connect locally to the teacher laptop.

Checkpoint 13 adds `/classroom`. It uses Supabase instructor Auth, temporary synthetic camper Auth
subjects created only after a valid class code, RLS-filtered Realtime hints, a role-aware roster,
remote Blockly load/push with explicit optimistic conflicts, help handling, and durable Run/Stop
status. When the block editor is opened from a bound classroom workspace, valid canonical changes
retain immediate local save and receive a 1.5-second cloud debounce.

The route requires only browser-safe `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. It never receives a Secret/service-role key.

The internal Apache prototype is built with `BADGERBOTS_CLASSROOM_STATIC_DEPLOYMENT=1`. That build
serves the classroom UI at the export root, prefixes assets with `/classroom`, and is packaged by
`pnpm web:package:classroom`. See `docs/apache-classroom-deployment.md`; this same-origin prototype
is limited to synthetic camper data.

Checkpoint 23 consolidates a bound student workspace into `/editor`: block search, Blockly, save
state, Run, and a slide-out classroom control panel share one page. Authorized instructor edits
autosave as new canonical revisions; an unchanged student editor receives and confirms them through
Realtime with a ten-second polling fallback. Unsynced student drafts fail closed rather than being
overwritten. Assigned instructors can retrieve a stable weekly class code repeatedly; only its
HMAC digest is stored.

Checkpoint 24 adds explicit shared-edit conflict choices and version history. When a remote revision
arrives while the local program has changed, the editor preserves the local draft and offers **Use
revision** or **Keep my work as a new version**. The classroom drawer lists immutable revisions with
actor kind, time, preview, and restore provenance. Instructor restore is atomic and creates a new
revision; it never starts Minecraft automatically. Apply `database/migrations/0010_program_version_restore.sql`
through the protected Supabase deployment workflow before testing this against the hosted API.
