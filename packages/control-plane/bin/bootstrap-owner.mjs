import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const required = [
  "BB_SUPABASE_URL",
  "BB_SUPABASE_SERVICE_ROLE_KEY",
  "BB_BOOTSTRAP_EMAIL",
  "BB_BOOTSTRAP_PASSWORD_FILE",
  "BB_BOOTSTRAP_ORGANIZATION",
  "BB_BOOTSTRAP_LOCATION",
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required protected setting ${name}.`);
}

const password = (await readFile(process.env.BB_BOOTSTRAP_PASSWORD_FILE, "utf8")).trimEnd();
if (password.length < 12) throw new Error("Bootstrap password must be at least 12 characters.");

const client = createClient(process.env.BB_SUPABASE_URL, process.env.BB_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const { data: created, error: authError } = await client.auth.admin.createUser({
  email: process.env.BB_BOOTSTRAP_EMAIL,
  password,
  email_confirm: true,
});
if (authError || !created.user) throw new Error("Owner identity could not be created.");

const { error: bootstrapError } = await client.rpc("bootstrap_owner", {
  owner_auth_subject: created.user.id,
  owner_email: process.env.BB_BOOTSTRAP_EMAIL,
  organization_name: process.env.BB_BOOTSTRAP_ORGANIZATION,
  location_name: process.env.BB_BOOTSTRAP_LOCATION,
});

if (bootstrapError) {
  await client.auth.admin.deleteUser(created.user.id);
  throw new Error("Owner bootstrap failed; the newly created identity was rolled back.");
}

console.log(
  "Initial BadgerBots owner created. Remove the password file and rotate the bootstrap credential.",
);
