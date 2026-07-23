# Checkpoint 2: Cloud control plane

Status: local domain, contract, migration, and security-overlay implementation complete on 2026-07-22. Provider-backed acceptance is not claimed because this workstation has no PostgreSQL, Supabase CLI, or Docker runtime and no external project was authorized.

## Genuinely working locally

- Portable PostgreSQL schema for organizations/locations, instructor membership, hosts, sessions, join-code abuse windows, devices and Minecraft mappings, temporary campers/enrollments, curriculum/world versions, workspaces/program history, progress/help, health/runtime events, and audits.
- Supabase overlay that revokes anonymous table access, restricts authenticated reads with row-level security, exposes only protected bootstrap/save functions to `service_role`, and publishes only selected authoritative rows.
- One-time HMAC-protected owner bootstrap and owner-only assistant provisioning through a server-side auth adapter. Passwords are sent to the provider administration API and are not persisted or logged by BadgerBots.
- Dated weekly sessions and minimal camper join using class code, first name, and one-letter last initial. Join codes, access credentials, and abuse keys are stored/handled as digests.
- Five-failure/ten-minute class-code limit with a fifteen-minute lockout and child-friendly recovery message.
- Canonical-program validation, idempotent optimistic saves, explicit revision conflicts, immutable versions, and restore-as-new-version behavior.
- Tenant/session authorization tests, compact realtime hints without camper names or program bodies, audit correlation IDs, and the active -> hidden/recoverable -> deletion-queued -> deleted state machine.
- Purge refuses to run until an instructor confirms the final backup has been deleted.

## Automated evidence

Run from the repository root with the pinned toolchain:

```sh
pnpm verify
pnpm build
```

The control-plane tests cover bootstrap, minimal identity, join abuse, concurrent camper/instructor edits, idempotency, restore history, cross-tenant refusal, expiry/recovery/purge, realtime redaction, foreign credentials, migration shape, provider grants, and safe auth-adapter configuration. Migration tests are static contract checks, not a substitute for executing PostgreSQL.

## Migrations and configuration

- Apply `database/migrations/0001_control_plane_core.sql`, then `database/providers/supabase/0002_supabase_security.sql` to a disposable environment before any shared environment.
- New protected settings are documented in `.env.example`: Supabase URL and service-role key, bootstrap identity/password-file inputs, organization/location names, and a 32+ character control-plane HMAC pepper.
- `pnpm bootstrap:owner` is the secure setup entry point. It requires a temporary password file and performs no default-account seeding.
- No Supabase, Cloudflare, email, paid, or production resource was created.

## Security and privacy

- RLS is enabled on every exposed application table. Anonymous table grants are revoked, and provider administrator credentials are never browser configuration.
- Camper data is limited to session-scoped first name and last initial; persistent device/Minecraft mapping has a separate lifecycle and opaque primary keys.
- Atomic workspace saves use row locking, explicit revision comparison, and client mutation IDs. Direct authenticated workspace updates are not granted.
- Realtime rows are notifications to re-fetch authorized state, not trusted commands.
- Real policy tests with authenticated owner, assistant, outsider, and camper requests are still mandatory. Static SQL inspection cannot prove deployed provider behavior.

## Provider manual verification still required

1. Install a supported local PostgreSQL/Supabase runtime or use an owner-authorized disposable Free project.
2. Apply both migrations twice: the clean apply must pass; the expected non-idempotent second apply must fail without changing existing data.
3. Disable public instructor signup, anonymous sign-in, and public Realtime channels.
4. Run owner bootstrap once, prove a second attempt fails, provision an assistant, and prove an unrelated organization cannot read the session.
5. Exercise simultaneous saves at the same revision and duplicate delivery of one mutation; confirm one version wins, one explicit conflict is returned, and a duplicate creates no version.
6. Verify expired camper credentials fail, retention transitions on controlled dates, and purge is gated by final-backup deletion.
7. Seed a 25-student week, measure database/index bytes, Realtime deliveries, function calls, and egress against `docs/free-tier-capacity-budget.md`.
8. Create an encrypted export and complete a restore drill before activating a real camp.

## Acceptance mapping

| Checkpoint 2 item                      | Local evidence                                          | Result                                                |
| -------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| Portable minimum schema and migrations | Core SQL and static schema tests                        | Implemented; execution pending                        |
| Secure owner/assistant authentication  | Domain tests, Supabase admin adapter, bootstrap command | Implemented; provider smoke pending                   |
| Minimal camper join and expiry         | Domain state-machine and abuse tests                    | Pass locally                                          |
| Optimistic autosave/conflict/restore   | Domain tests and atomic SQL function                    | Pass locally; database race smoke pending             |
| Tenant/session authorization           | Service tests and RLS policies                          | Pass locally; deployed RLS tests pending              |
| Realtime roster/status                 | Compact hint contract and selected publication          | Contract only; live reconnect UI pending              |
| Recoverable deletion                   | Clock/purge tests and schema states                     | Pass locally; provider job/export integration pending |
| Free-tier fit                          | Capacity ceilings documented                            | Measurement pending                                   |

## Unresolved issues and next checkpoint

- Checkpoint 2 cannot be marked accepted until migrations and RLS run against real PostgreSQL/Supabase and the web client exercises durable reconnect/conflict handling.
- Free-tier provider pausing and lack of managed backups remain operational gates; $0 is a planning target, not an availability guarantee.
- Device/Minecraft mapping is modeled but its installer persistence behavior belongs to Checkpoint 5.
- The next engineering checkpoint is the runtime protocol and Paper spike, but it should not displace the outstanding Checkpoint 2 provider evidence.
