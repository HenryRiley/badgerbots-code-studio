# Control plane

This package contains the provider-neutral Checkpoint 2 domain service and the narrow Supabase instructor-auth adapter. It implements one-time owner bootstrap, owner/assistant authorization, dated sessions, minimal camper joining, optimistic program saves, immutable restore history, compact realtime hints, audit records, and the recoverable retention state machine.

The in-memory store exists for deterministic domain tests; it is not a production persistence layer. Standard PostgreSQL migrations are in `database/migrations/`, with Supabase-only grants and publication configuration in `database/providers/supabase/`.

## Owner bootstrap

Apply and verify the database migrations first. Configure the protected variables documented in `.env.example`, place the initial password in a temporary owner-readable file, then run:

```sh
pnpm bootstrap:owner
```

The command uses Supabase's server-side administration API, calls the one-time `bootstrap_owner` function, never prints the password or administrative key, and removes the newly created auth user if database bootstrap fails. Delete the password file and rotate/remove the bootstrap credential immediately afterward. Never run this from a browser or commit its inputs.

No provider project or external resource is created automatically.
