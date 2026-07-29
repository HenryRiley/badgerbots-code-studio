# Checkpoint 15 operator slice: complete test-pilot reset

Status: guarded reset/bootstrap operations and automated contract checks implemented; destructive
execution against the owner’s Supabase test project remains an explicit manual action

## Scope

This procedure is for a disposable test pilot only. It removes every BadgerBots application row,
including organizations, locations, instructors, memberships, Hosts, devices, mappings, sessions,
campers, workspaces, versions, runtime records, audit records, curriculum rows, world-template
metadata, recovery payloads, and the one-time owner-bootstrap marker.

It preserves database schemas, migrations, functions, extensions, RLS policies, Supabase project
configuration, Edge Functions, repository secrets, and locally stored Minecraft worlds/backups.
The reset cannot remotely delete files already stored on a teacher laptop.

## Safety boundary

- The application reset refuses to run until its explicit confirmation placeholder is replaced.
- It names every application table rather than dropping or recreating schemas.
- It does not directly mutate Supabase-managed Auth tables.
- Old Auth users are deleted through Supabase Authentication administration.
- Fresh-owner bootstrap requires exactly one active Auth user with the exact confirmed email.
- The password stays exclusively in Supabase Auth and is never entered into SQL or repository
  files.

## Manual test

1. Stop active Web, Host, Paper, and Connect processes.
2. Back up the disposable Supabase project if any test evidence must be retained.
3. In Supabase SQL Editor, run guarded operation
   `database/operations/complete-test-pilot-reset.sql` after replacing its confirmation value.
4. In **Authentication → Users**, delete every old test user.
5. Create exactly one new instructor user, choose a new password privately, and confirm the email.
6. In SQL Editor, run `database/operations/bootstrap-existing-test-owner.sql` after replacing its
   email, organization, and location placeholders.
7. Confirm `public.instructors`, `public.memberships`, `public.organizations`, and
   `public.locations` each contain the expected fresh owner data.
8. Open the installed Host 0.8.1 and sign in. It should advance to choosing/pairing the new
   location because the prior Host pairing was intentionally removed.

## Limitations

Deleting Auth users does not revoke already-issued JWTs immediately; Supabase documents that they
remain valid until expiry. The emptied application mappings prevent those tokens from authorizing
BadgerBots operations. Stop test clients before the reset and do not reuse the project for real
children until the complete security/readiness review is finished.
