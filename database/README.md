# Control-plane database

`migrations/` contains ordered standard PostgreSQL migrations. Provider-specific grants and Realtime publication/policies live under `providers/` so the domain schema does not depend on Supabase Auth IDs, SDK types, or proprietary table APIs.

Migrations `0001`–`0005` and Supabase overlays `0002`, `0006`, and `0007` have been exercised
against the free pilot. Checkpoint 21 adds portable migration
`0008_device_player_routing.sql` and provider overlay
`0009_device_player_routing_security.sql`. Apply both through the reviewed deployment workflow:
they replace over-constrained mapping history keys, add one-active-mapping indexes, and expose an
atomic service-role-only mapping function. Live rollback, concurrent remap, and adversarial RPC
tests remain required. Never point automated migration tests at production.
