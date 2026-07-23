# Control-plane database

`migrations/` contains ordered standard PostgreSQL migrations. Provider-specific grants and Realtime publication/policies live under `providers/` so the domain schema does not depend on Supabase Auth IDs, SDK types, or proprietary table APIs.

Checkpoint 2 currently includes the complete initial schema and Supabase security overlay. Applying it to a real local/hosted PostgreSQL instance remains an external verification item until a supported PostgreSQL or Supabase CLI runtime is available. Never point migration tests at production.
