# Checkpoint 15 corrective slice: instructor sign-in recovery

Status: implementation and automated verification complete; physical Windows/Supabase verification
required

## Working in the repository

- Host sends a trimmed, lowercase instructor email to Supabase Auth.
- Login accepts any non-empty password up to the defensive 256-byte limit. Password creation
  policy remains owned by Supabase; Host no longer rejects an otherwise valid existing account
  because its password is shorter than twelve characters.
- Supabase Auth response codes and HTTP status are mapped to actionable, non-sensitive guidance.
  Invalid credentials, unconfirmed or disabled accounts, rate limiting, rejected public keys, and
  service outages no longer collapse into the same message.
- The password is still memory-only and cleared from the form after every attempt.
- An unpaired installation can replace its Project URL and browser-safe Publishable key from the
  graphical sign-in screen. Paired Hosts still fail closed and require an explicit unpair workflow
  before changing service boundaries.

## Automated evidence

- Rust tests cover email normalization.
- Rust tests cover invalid credentials, email confirmation, invalid public key, rate limit, and
  service-outage messages.
- Host TypeScript build/type checks cover the new graphical recovery control.
- Existing native credential, server, Java, Paper, backup, and world-preservation tests remain
  required.

## Manual Windows verification

1. Install BadgerBots Host 0.8.1 over the existing prototype.
2. Enter a known owner instructor email with leading/trailing spaces and its current password.
   Confirm sign-in succeeds and location selection appears.
3. Sign out, enter an incorrect password, and confirm Host says the email or password was not
   accepted rather than reporting an unrelated service failure.
4. On a disposable unpaired installation, configure a wrong or retired Publishable key. Confirm
   sign-in identifies the rejected service key.
5. Select **Change service connection**, enter the current Supabase Project URL and Publishable
   key, then sign in successfully. Do not use a Secret or service-role key.
6. If available, use an unconfirmed disposable Auth user and confirm Host instructs the tester to
   confirm the email.
7. Confirm no password or access token appears in the UI, application data, Recent events, or live
   Paper console.

## Remaining boundary

Automated tests cannot prove the current BadgerBots instructor record, password, email-confirmation
state, project availability, or deployed `classroom-api` profile membership. Those remain
environment checks in Supabase and on the BadgerBots Windows computer.
