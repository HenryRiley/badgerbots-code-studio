# Checkpoint 13: connected classroom

Status: implementation complete; live migration/function/two-device validation required

## Working in the repository

- `/classroom` supports Supabase instructor login, owner session creation, one-time weekly class codes, temporary camper join, session recovery, owner-provisioned assistants, roster/help handling, remote block loading/push, explicit conflicts, Run, and Stop.
- The Blockly editor retains immediate local saves. A classroom-bound workspace sends validated canonical changes after a 1.5-second debounce and never overwrites a conflicting remote revision.
- Authenticated RLS-filtered Realtime changes refresh instructor and camper state. Five-minute fallback reads are authoritative recovery, not fake live indicators.
- Student presence uses a narrow direct RLS upsert. The dashboard labels a camper online only when a recent actual heartbeat exists.
- Migration `0005` adds temporary Auth subjects, one-time owner bootstrap state, a durable ordered command queue, atomic claiming/redelivery, and persistent join throttling.
- Supabase overlay `0006` grants only active campers their own workspace/version/help visibility and gives assigned instructors session-scoped command visibility.
- The `classroom-api` Edge Function performs privileged join, session, assistant, save, help, pairing, runtime queue, Host polling, and acknowledgement operations.
- The Paper developer launcher optionally starts an outbound classroom Host worker. It authenticates every cloud response, rejects stale/expired sequences, validates and compiles the canonical program locally, uses the existing authenticated Paper file bridge, and acknowledges the durable command.

## Automated evidence

- Deno formatting, lint, type checking, and three Edge helper tests cover join-code alphabet, HMAC digests, minimal names, supported AST validation, unsupported shapes, and unsafe explosion limits.
- Host tests cover canonical compilation, unsafe-program rejection before Paper, and command-signature payload binding.
- Migration tests cover private camper identity, owner bootstrap isolation from developer prototype rows, RLS, persistent rate limiting, ordered queue locking, redelivery, and Realtime publication.
- Existing control-plane, Web, runtime, Java, Rust, and repository checks remain part of `pnpm verify` and CI.

## Not yet claimed

- The owner must apply migrations `0005` and `0006`, deploy the Edge Function, bootstrap a real owner, and run the two-device test in `docs/connected-classroom-setup.md`.
- No Cloudflare Pages deployment was created. Until the static Web export is hosted, each test computer must run its own local Web copy against the same Supabase project.
- Native Host pairing storage, token rotation, assistant forced-password-change/recovery email, scheduled provider Auth cleanup, encrypted export/restore, multi-student private Paper worlds, and a 25-student physical test remain open.
- The current Paper prototype still targets the first player in one Sheep City world. Cloud classroom identity is real, but per-student Minecraft routing is the next runtime increment.

## Acceptance mapping

- Sheep City 5: dated weekly session and join code implemented; live two-device evidence pending.
- Sheep City 6: minimal camper join and temporary Auth session implemented; device mapping remains open.
- Sheep City 9: immediate local plus debounced durable save and explicit conflicts implemented; live Realtime evidence pending.
- Sheep City 10–11: durable Run/Stop reaches the existing validated Host/Paper boundary and retains canonical validation; live cloud-to-Windows run pending.
- Sheep City 12–13: roster, presence, revisions, help, remote load/push, command status, and conflicts implemented.
- Architecture outbound-host rule: implemented without a browser-to-Host port; live interruption/reconnect evidence pending.
