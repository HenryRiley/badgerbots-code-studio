import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";

const url = process.env.BB_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const recoverySecret = process.env.BADGERBOTS_PROTOTYPE_RECOVERY_SECRET;

if (!url || !serviceRoleKey || !recoverySecret) {
  throw new Error(
    "Set BB_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and BADGERBOTS_PROTOTYPE_RECOVERY_SECRET before checking the prototype database.",
  );
}
if (Buffer.from(recoverySecret, "base64url").byteLength !== 32) {
  throw new Error("BADGERBOTS_PROTOTYPE_RECOVERY_SECRET must decode to exactly 32 bytes.");
}

const client = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const probeDigest = createHash("sha256").update(`badgerbots-readiness-${Date.now()}`).digest("hex");
const { error: recoveryError } = await client.rpc("load_prototype_lab_recovery", {
  recovery_token_digest: probeDigest,
});
if (recoveryError) {
  throw new Error(
    "Supabase recovery function is unavailable. Apply database migrations 0001 through 0004.",
  );
}

const { error: workspaceError } = await client
  .from("project_workspaces")
  .select("id", { head: true, count: "exact" })
  .limit(1);
if (workspaceError) {
  throw new Error(
    "Supabase control-plane tables are unavailable. Apply database migrations 0001 through 0004.",
  );
}

process.stdout.write(
  "Supabase prototype readiness passed: schema, privileged recovery function, and server-only credentials are usable.\n",
);
