# ADR 0012: Connected classroom identity and Edge API

Status: accepted for the one-camp prototype on 2026-07-25; live provider and privacy acceptance remain required.

## Context

Checkpoint 12 proved durable Supabase persistence but still used one loopback bearer token and a browser-to-local API. A classroom needs separate instructor and camper authorization, cross-device state, and an outbound-only Host path. Direct anonymous table access would expose child records, while enabling unrestricted Supabase anonymous signup would create an avoidable abuse and quota-exhaustion surface.

## Decision

- Instructors use Supabase email/password Auth. Public instructor signup remains disabled. The protected bootstrap command creates the first owner, and owners may provision assistants through the privileged classroom API.
- Camper join goes through one rate-limited `classroom-api` Supabase Edge Function. After a valid weekly HMAC-protected code, it creates a temporary synthetic Auth identity containing no camper name or email metadata. The browser receives a normal short-lived Supabase session but the child sees no password.
- The opaque Auth subject is attached to the temporary camper row. RLS permits only that camper to read their active workspace and compact status. All writes still pass through the Edge Function for canonical validation and optimistic concurrency.
- Instructor and camper browsers use RLS-filtered Postgres Changes as delivery hints. Canonical rows remain authoritative. Five-minute authenticated fallback reads cover missed events without consuming the free Edge Function allowance at a rapid polling cadence.
- Valid block edits save locally immediately and use a 1.5-second cloud debounce. Revision conflicts preserve local blocks and require explicit review.
- Runtime requests are durable `classroom_commands` rows with per-Host monotonic sequences, short expiry, and idempotent command IDs. The teacher process polls outbound with a dedicated random Host token. Each response and acknowledgement is HMAC-bound to that credential before the Host validates and compiles the canonical program for Paper.
- No browser connects to a teacher-laptop HTTP port. Minecraft remains on local Wi-Fi.

## Security consequences

- The Edge Function has service-level database access and is therefore a high-value boundary. It accepts only configured Web origins or Host-authenticated requests, returns generic database failures, caps request size, verifies instructor/camper identity and tenancy, and stores only credential digests.
- Synthetic camper Auth users must be deleted with camper retention. That provider cleanup job and adversarial live RLS test remain release gates.
- The prototype Host token is copied once into the teacher process environment. Native Host OS-protected storage and rotation remain required before release.
- Edge validation mirrors the Sheep City canonical schema and is tested against safe and unsafe fixtures; the Host validates again with `@badgerbots/program-model` before Paper delivery.

## Free-tier consequences

Realtime carries changes instead of heartbeats. Camper presence writes directly through narrow RLS every 45 seconds, dashboard fallback reads occur every five minutes, and idle Host polling backs off to five seconds. The measured pilot must remain under the internal 250,000 monthly Edge invocation review threshold.

## Rejected alternatives

- LAN/browser calls to the teacher laptop violate the locked topology.
- Public database writes or public Realtime channels violate child-data tenancy.
- Enabling general anonymous Auth signup allows unauthenticated quota consumption before a class code is checked.
- Storing raw join codes, camper credentials, or Host pairing tokens would turn a database read into immediate account compromise.
