# Supabase security overlay

Apply the core migration first, then the Supabase overlay. In the project dashboard:

- disable public instructor signup and anonymous sign-in;
- keep the service-role/secret key only in protected administrative or Edge Function secrets;
- disable public Realtime channels;
- use private channels or RLS-filtered Postgres Changes only for authenticated instructors;
- route camper join/autosave through privileged functions that validate opaque hashed session credentials;
- configure password length/character requirements and custom SMTP before production;
- do not activate a camp until the encrypted export/restore readiness gate passes.

The owner has manually validated the earlier prototype persistence against a Supabase Free project.
The repository itself does not create or modify external projects. For the connected classroom,
apply portable migration `0005`, then provider overlay `0006`, deploy `classroom-api`, and follow
`docs/connected-classroom-setup.md`.

Provider migration `0007` adds fail-closed recovery when an administrator deletes and recreates an
instructor in Supabase Auth. It may rebind the application profile only when the new Auth identity
has the exact confirmed email, the prior Auth UUID no longer exists, and no other instructor uses
the new UUID. The service-role-only function writes an organization audit record. Public
instructor signup must remain disabled.
