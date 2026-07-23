# Supabase security overlay

Apply the core migration first, then the Supabase overlay. In the project dashboard:

- disable public instructor signup and anonymous sign-in;
- keep the service-role/secret key only in protected administrative or Edge Function secrets;
- disable public Realtime channels;
- use private channels or RLS-filtered Postgres Changes only for authenticated instructors;
- route camper join/autosave through privileged functions that validate opaque hashed session credentials;
- configure password length/character requirements and custom SMTP before production;
- do not activate a camp until the encrypted export/restore readiness gate passes.

No Supabase project has been created or modified by this repository.
