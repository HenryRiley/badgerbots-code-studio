# ADR 0009: Zero-cost pilot platform

Status: accepted on 2026-07-22 for the initial one-camp pilot. Supersedes ADR 0003's paid provider baseline and ADR 0004's application-managed hosted authentication.

## Context

The owner rejected the approximately $35/month paid baseline and requested free-tier services. The initial deployment serves one camp, 20-25 students, a small instructor team, and one Host. Minecraft compute and bulk world data remain on the teacher laptop.

## Decision

- Host the exported/static web shell on Cloudflare Pages Free. Use Pages Functions only if a measured operation cannot safely run in Supabase; do not place a general server-rendering workload behind the Workers Free 10 ms CPU limit.
- Use one Supabase Free project for standard PostgreSQL, Supabase Auth, Realtime, Storage for small original curriculum images only, and Edge Functions for privileged control-plane operations.
- Use Supabase email/password authentication for instructors. Disable public instructor signup. A local administrative bootstrap command uses a service-role credential to create the first owner without hard-coded credentials. Supabase Auth stores salted bcrypt password hashes and rotates its own tokens.
- Configure Resend Free as custom SMTP for instructor invitation, verification, and recovery email. Camper joining never sends email. If an existing BadgerBots domain is unavailable, instructor bootstrap and owner-assisted recovery must work without email; buying a domain is outside the $0 infrastructure claim.
- Keep the `service_role` key exclusively in protected administrative/Edge Function secrets. Browsers and Hosts receive only publishable or narrowly scoped short-lived credentials. All application tables use row-level security plus explicit organization/location/session checks.
- Browsers and Host use Supabase Realtime through an adapter in `packages/runtime-protocol`. Durable program versions, commands, acknowledgements, and audit records remain PostgreSQL rows; realtime messages are delivery hints, not authoritative state.
- Keep schema migrations as portable SQL and isolate Supabase Auth IDs behind BadgerBots instructor/membership identifiers. Curriculum, compiler, runtime, and world models must not import Supabase SDK types.
- Create no external project, domain, or provider account without owner authorization and privacy/data-processing review.

## Published free allowances used for planning

As of 2026-07-22, Supabase Free publishes 500 MB database storage, 50,000 monthly active users, 5 GB egress, 1 GB file storage, 500,000 Edge Function invocations, 2 million realtime messages, and 200 peak realtime connections. Cloudflare Pages Free publishes 500 builds/month, 20,000 files, and 100 custom domains. Resend Free publishes 3,000 emails/month with a 100/day cap.

The [capacity budget](../free-tier-capacity-budget.md) reserves at least 50% headroom rather than planning to the quota edge.

## Hard limitations and controls

- Supabase may pause a free project after a week of low activity and provides no Free managed database backups. The instructor cannot open a camp session until a pre-camp check confirms the project is active and a tested encrypted export exists.
- Monday readiness must be checked at least 24 hours before class and again before student join is enabled. A paused or unhealthy project is a blocking state, never a fake green status.
- The Host keeps a bounded local cache so an already-running class can tolerate a brief cloud interruption. Free tiers are not an availability SLA.
- Store compact canonical AST versions and redacted events, not Blockly render caches, world archives, screenshots, or verbose logs in PostgreSQL. Retention cleanup and quota alarms run before the database reaches 400 MB.
- If a measured rehearsal exceeds 100 realtime connections, 1 million monthly messages, 250 MB database storage, 2.5 GB egress, or 250,000 monthly function calls, stop and redesign/compress before relying on the free tier. Do not silently incur charges or weaken safety/retention.
- Production use with children still requires privacy/legal review of Cloudflare, Supabase, and Resend terms and data-processing agreements. Free price does not establish legal suitability.

## Exit criteria

Move to a paid or self-hosted provider only when measurements, reliability, backup requirements, contract requirements, or multi-location scale exceed these gates. The portable SQL schema and provider adapters make that a deployment change rather than a product rewrite.

## Evidence

- Supabase plan limits: <https://supabase.com/docs/guides/platform/billing-on-supabase>
- Supabase free-project pausing: <https://supabase.com/docs/guides/platform/free-project-pausing>
- Supabase password storage: <https://supabase.com/docs/guides/auth/password-security>
- Supabase SMTP limitations: <https://supabase.com/docs/guides/auth/auth-smtp>
- Cloudflare Pages limits: <https://developers.cloudflare.com/pages/platform/limits/>
- Cloudflare Workers limits: <https://developers.cloudflare.com/workers/platform/limits/>
- Resend pricing: <https://resend.com/pricing>
