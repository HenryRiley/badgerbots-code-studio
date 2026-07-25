# Free-tier capacity budget

Planning target: one location, one active camp, 25 students, up to 5 instructors/helpers, one Host, and a small number of support/admin connections. This is a budget to verify in Checkpoints 2, 3, and 7, not evidence that the workload already fits.

## Realtime

| Item                           | Conservative pilot budget |
| ------------------------------ | ------------------------: |
| 25 student browsers            |            25 connections |
| 5 instructor/helper browsers   |             5 connections |
| Host plus reconnect overlap    |             2 connections |
| Preview/admin/test reserve     |             8 connections |
| Planned peak                   |            40 connections |
| Supabase Free published peak   |           200 connections |
| Internal stop/review threshold |           100 connections |

At a five-second status cadence for 25 students during six hours/day over 20 camp days, raw status events are about 2.16 million and would exceed the monthly free message quota before edits or acknowledgements. Therefore presence/status must be coalesced: publish changed state only, have the Host batch all Minecraft status into one snapshot no more often than every 30 seconds, and have instructor dashboards query that aggregate rather than fan out a realtime heartbeat per student. Realtime is reserved for edits, commands, acknowledgements, help requests, and state transitions. The design target is below 1 million realtime messages/month after counting delivery to each subscriber.

## Database and storage

| Resource     | Published free allowance |              Internal threshold |
| ------------ | -----------------------: | ------------------------------: |
| PostgreSQL   |                   500 MB | 250 MB normal; 400 MB hard stop |
| File storage |                     1 GB |                          500 MB |
| Egress       |               5 GB/month |                    2.5 GB/month |

World templates, Minecraft backups, installer artifacts, videos, and verbose diagnostics do not belong in Supabase. The Checkpoint 2 schema stores canonical AST snapshots, compact audit/runtime events, minimal identities, and source-verified curriculum metadata. Row/index size with 25-student seed data remains unmeasured because no PostgreSQL/Supabase runtime is installed; that measurement is required before provider acceptance.

## Functions and email

| Resource                   | Published free allowance |  Internal threshold |
| -------------------------- | -----------------------: | ------------------: |
| Supabase Edge Functions    |      500,000 calls/month | 250,000 calls/month |
| Resend transactional email |     3,000/month, 100/day |              50/day |

Autosave uses an atomic PostgreSQL operation with optimistic revisions and mutation idempotency.
Checkpoint 13 invokes the Edge Function only after a 1.5-second valid-program debounce rather than
per keystroke. Planning at 200 acknowledged program saves per camper per day is 100,000 monthly
invocations. Five-minute fallback reads for 25 campers and five instructors add about 43,200; idle
Host polling every five seconds for six hours over 20 days adds about 86,400. Joins, help, pairing,
and control commands keep the planned total just below the 250,000 internal review threshold.
Realtime delivery must work in the staged test; shortening fallback/Host polling globally would
break the free-tier budget. Camper presence uses narrow direct RLS writes rather than Edge
invocations. Camper workflows send no email.

## Availability and recovery gate

Free Supabase projects may pause after low activity and do not include managed backups. At least 24 hours before each camp week:

1. confirm the project is active and all migrations match the release;
2. run login, camper join, realtime Host connection, save/restore, and retention smoke tests;
3. create and restore-test an encrypted database export in a BadgerBots-managed location;
4. verify quota dashboards remain under internal thresholds;
5. prevent session activation if any check fails.

During camp, Host local cache supports short outages but is not a second cloud database. Recovery and reconciliation behavior must be tested before the free-tier deployment is called usable.
