# ADR 0004: Instructor authentication and secure bootstrap

Status: superseded on 2026-07-22 by [ADR 0009](0009-zero-cost-pilot-platform.md) for the hosted pilot. The security requirements remain applicable to a future self-hosted authentication implementation.

## Decision

- Use application-managed instructor email/password authentication backed by PostgreSQL, with Argon2id password hashes and opaque, rotated server-side sessions in Secure, HttpOnly, SameSite cookies.
- Require CSRF protection for state changes, login and recovery rate limits, generic authentication errors, audited role changes, and session revocation after password reset or suspected compromise.
- Create the first organization owner through a local/administrative bootstrap command that produces a single-use, short-lived setup link. The command accepts the email interactively or through a protected secret input; no account or password is seeded in source, migrations, images, or logs.
- Store normalized email for lookup and the original presentation form separately. Require unique opaque IDs for instructors, memberships, organizations, and locations.
- Camper weekly join is a separate low-privilege flow and never creates instructor sessions. Device/Minecraft mapping is also a separate persistent identity boundary.
- Defer production password-reset email until the email provider and domain are configured. Local development prints a redacted link to the console.

## Required Checkpoint 2 evidence

Argon2 parameters must be benchmarked on the deployment class, setup tokens must be hashed at rest and expire, authorization tests must cover owner/assistant/tenant boundaries, and session fixation/CSRF/rate-limit tests must pass.
