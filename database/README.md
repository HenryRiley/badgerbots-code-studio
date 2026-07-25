# Control-plane database

`migrations/` contains ordered standard PostgreSQL migrations. Provider-specific grants and Realtime publication/policies live under `providers/` so the domain schema does not depend on Supabase Auth IDs, SDK types, or proprietary table APIs.

Migrations `0001`–`0004` have been exercised by the owner against a Supabase Free prototype.
Checkpoint 13 adds `0005_connected_classroom.sql` and provider overlay
`0006_connected_classroom_security.sql`; those two files still require live application and
adversarial RLS verification. Never point automated migration tests at production.
