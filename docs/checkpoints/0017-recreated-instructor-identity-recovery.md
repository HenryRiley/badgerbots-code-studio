# Checkpoint 15 corrective slice: recreated instructor identity recovery

Status: implementation and automated verification complete; deployment and real Supabase
verification required

## Root cause

Supabase Auth assigns a new UUID when an account is deleted and recreated. BadgerBots correctly
keys `public.instructors.auth_subject` to that opaque UUID rather than to an email address. The
replacement account can therefore pass password authentication while failing instructor
authorization with `Instructor access was not found`.

This behavior is independent of Windows 10 versus Windows 11 because it occurs in the cloud profile
lookup after authentication.

## Implemented recovery

- An authenticated profile request first uses the exact Auth UUID as before.
- If no instructor matches, the API may request a service-role-only database rebind.
- The database transaction requires an exact normalized email match, a confirmed replacement Auth
  user, a deleted prior Auth UUID, and an unused replacement UUID.
- The transaction preserves the instructor primary key, memberships, sessions, locations, and
  paired Hosts.
- Each organization membership receives an `instructor_auth_subject_rebound` system audit record
  with no email or token in its redacted context.
- If any precondition fails, authorization remains denied. The flow never provisions an instructor
  merely because a person can create a general Auth account.

## Deployment

1. From protected release automation, apply
   `database/providers/supabase/0007_instructor_identity_recovery.sql` to the existing Supabase
   project.
2. Deploy the updated `classroom-api` Edge Function from the same reviewed commit.
3. Keep public instructor signup disabled.
4. Retry sign-in from the already-installed Host 0.8.1; no new Windows installer is required for
   this cloud-side correction.

The teacher laptop must not clone this repository or receive a database URL, Supabase access token,
Secret key, CLI, or migration script. The protected **Deploy Supabase production** GitHub workflow
is the intended operational path.

## Verification

- Migration tests assert confirmation, prior-identity deletion, audit, and service-role boundaries.
- Deno formatting, lint, type checking, and Edge tests remain required.
- Real acceptance requires recovery of a disposable recreated account and a negative test where
  the old Auth identity still exists.
