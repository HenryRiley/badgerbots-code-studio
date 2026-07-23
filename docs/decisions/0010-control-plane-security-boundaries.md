# ADR 0010: Control-plane security boundaries

Status: accepted for local implementation on 2026-07-22; real Supabase migration and policy verification remain required before deployment.

## Context

Checkpoint 2 needs low-cost instructor authentication, passwordless temporary camper access, concurrent student/instructor saves, and realtime classroom state. Direct anonymous table access or provider identities leaking into the domain model would make the child-data and portability boundaries fragile.

## Decision

- Supabase Auth authenticates instructors only. Public signup and anonymous sign-in are disabled; the first owner is created by a one-time protected administrative command and later instructors are owner-provisioned.
- A Supabase auth subject maps to an opaque BadgerBots instructor ID. Organization membership and session assignment authorize every instructor operation; email and display names are never keys.
- Campers use a weekly class code, first name, and last initial. Class codes and camper access credentials are stored only as HMAC digests. Camper operations go through privileged control-plane handlers; anonymous clients receive no direct table grants.
- Invalid class-code attempts are keyed by an HMAC-derived coarse device/network abuse key, limited to five failures in ten minutes, and locked for fifteen minutes. Raw IP addresses or device labels are not retained by the domain service.
- Canonical programs use immutable versions. An atomic database function locks the workspace row, deduplicates a client mutation, compares the expected revision, and either creates the next version or returns the authoritative conflict.
- Realtime is a delivery hint, not authority. Only selected compact rows are published, public channels are disabled, and reads are re-authorized through row-level security. Names and canonical program content are excluded from compact domain hints.
- Session access ends after `ends_on`. Records remain hidden and recoverable for a configured 7-14 days, then enter a deletion queue. Permanent purge requires explicit confirmation that the corresponding final backup is deleted.
- Provider administration credentials remain server-side. The domain packages expose provider-neutral identifiers and contracts; only the adapter imports the Supabase SDK.

## Consequences

The free-tier design remains a modular monolith with standard PostgreSQL as its durable source. The in-memory service makes state-machine and authorization behavior testable without external services, but it is not deployable persistence. A real provider smoke test must apply both migrations, verify RLS with multiple authenticated users, exercise concurrent saves, and test export/restore before Checkpoint 2 can be marked fully accepted.

## Evidence

- Supabase row-level security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Realtime authorization: <https://supabase.com/docs/guides/realtime/authorization>
- Admin user creation: <https://supabase.com/docs/reference/javascript/auth-admin-createuser>
- Auth configuration: <https://supabase.com/docs/guides/auth/general-configuration>
- Password security: <https://supabase.com/docs/guides/auth/password-security>
