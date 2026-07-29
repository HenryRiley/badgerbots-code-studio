# Connected classroom setup and two-device test

This is an internal prototype procedure. Use fake camper names. It does not authorize use with real children.

The repository and PowerShell steps in this guide are developer/cloud-administrator procedures.
They do not belong on a camp teacher laptop. A normal teacher installs BadgerBots Host, opens it,
and signs in. The Host installer contains only browser-safe Project URL/Publishable key values;
database and Edge Function changes are deployed centrally and must never be bundled with a
Secret/service-role credential.

Checkpoint 14 replaces the instructor-facing Host pairing environment variables with the native
Windows wizard. The CLI steps below remain only for developers testing the unbundled Paper runtime.
After updating to Checkpoint 14, redeploy `classroom-api` once so the restricted native onboarding
client can call the authenticated profile and pairing actions.

## 1. Apply the two new SQL files

From the repository root on Windows, copy and run each file separately in Supabase SQL Editor:

```powershell
Get-Content -Raw "database/migrations/0005_connected_classroom.sql" | Set-Clipboard
```

```powershell
Get-Content -Raw "database/providers/supabase/0006_connected_classroom_security.sql" | Set-Clipboard
```

Both queries must finish successfully. Then apply
`database/providers/supabase/0007_instructor_identity_recovery.sql`. Do not re-run an already
successful migration.

## 2. Deploy the Edge Function

Get the project reference from the Supabase URL. For `https://abcdef.supabase.co`, the reference is `abcdef`.

```powershell
corepack.cmd pnpm dlx supabase@2.109.1 login
corepack.cmd pnpm dlx supabase@2.109.1 link --project-ref YOUR_PROJECT_REFERENCE
```

Generate a credential pepper without placing the value in Git:

```powershell
$credentialPepper = node.exe -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
corepack.cmd pnpm dlx supabase@2.109.1 secrets set "BADGERBOTS_CREDENTIAL_PEPPER=$credentialPepper"
corepack.cmd pnpm dlx supabase@2.109.1 functions deploy classroom-api
```

### Recover a recreated instructor account

Supabase Auth assigns a new UUID when an account is deleted and recreated, even when its email is
the same. Apply provider migration `0007` and redeploy `classroom-api` before trying the Host
again. On the next successful password login, the API will automatically relink the existing
instructor profile only if:

- the replacement Auth user has the same confirmed email;
- the previous Auth UUID has actually been deleted;
- the new UUID is not linked to another instructor; and
- public instructor signup remains disabled.

The recovery preserves the existing organization, location, session, and Host records and writes
an audit record. It does not create a second organization or rerun the one-time owner bootstrap.
If the prior Auth user still exists, use that identity or deliberately remove the obsolete user;
the recovery will not take its access.

### Preferred central deployment

After `.github/workflows/deploy-supabase.yml` is merged, configure the GitHub `production`
environment once with protected secrets:

- `SUPABASE_ACCESS_TOKEN`: a Supabase personal access token used only by release automation;
- `SUPABASE_PROJECT_REF`: the project reference, not a key; and
- `SUPABASE_DB_URL`: the protected PostgreSQL connection URL from Supabase.

Require repository-owner approval on the `production` environment. Then open GitHub Actions,
choose **Deploy Supabase production**, select **Run workflow**, and enter `deploy`. The workflow
applies migration `0007` with stop-on-error behavior and then deploys `classroom-api`. It uses a
single concurrency lock so two production deployments cannot overlap.

These secrets stay in GitHub and are not passed to Host or Connect builds. Normal instructors and
camp laptops do not need Git, Node.js, pnpm, PowerShell, the repository, or Supabase administrator
access.

### Complete disposable-pilot reset

For a deliberately destructive test-only reset, use the two guarded operations in
`database/operations/` from Supabase SQL Editor:

1. `complete-test-pilot-reset.sql` empties all BadgerBots application tables after explicit
   confirmation but does not modify Supabase-managed Auth tables.
2. Delete old users through **Authentication → Users**, then create exactly one confirmed
   replacement instructor.
3. `bootstrap-existing-test-owner.sql` verifies that single confirmed identity and creates the new
   organization, location, instructor, and owner membership without accepting a password in SQL.

Do this from the owner’s administrative browser, never from a camp teacher laptop. It intentionally
removes cloud Host pairing, sessions, camper/device mappings, workspaces, curriculum rows, audit
history, and recovery payloads. It does not remove local Minecraft worlds or backups from an
already-installed Host.

The function defaults to the four local Code Studio origins. Before a hosted Web deployment, add its exact HTTPS origin:

```powershell
corepack.cmd pnpm dlx supabase@2.109.1 secrets set "BADGERBOTS_WEB_ORIGINS=http://127.0.0.1:3000,http://localhost:3000,https://YOUR-WEB-ORIGIN"
```

## 3. Bootstrap the real owner once

In Supabase **Project Settings → API Keys**, copy the server Secret key. The `sb_secret_...` key is accepted even though the historical environment variable says `SERVICE_ROLE`.

Create a temporary password file without typing the password into command history:

```powershell
$passwordPath = Join-Path $env:TEMP "badgerbots-owner-password.secret"
$securePassword = Read-Host "Choose an owner password of at least 12 characters" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  [IO.File]::WriteAllText($passwordPath, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer))
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
```

Set protected values in the same PowerShell window:

```powershell
$env:BB_SUPABASE_URL = "https://YOUR_PROJECT_REFERENCE.supabase.co"
$env:BB_SUPABASE_SERVICE_ROLE_KEY = "PASTE_SERVER_SECRET_KEY"
$env:BB_BOOTSTRAP_EMAIL = "YOUR_INSTRUCTOR_EMAIL"
$env:BB_BOOTSTRAP_PASSWORD_FILE = $passwordPath
$env:BB_BOOTSTRAP_ORGANIZATION = "BadgerBots"
$env:BB_BOOTSTRAP_LOCATION = "YOUR_LOCATION_NAME"
corepack.cmd pnpm bootstrap:owner
Remove-Item -LiteralPath $passwordPath
Remove-Item Env:BB_SUPABASE_SERVICE_ROLE_KEY
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
```

The command is single-use and rolls the Auth user back if database setup fails. Removing both
server-key environment variables before starting Web ensures no browser-development process
inherits them.

## 4. Configure browser-safe Web values

Copy the Supabase Project URL and Publishable key, then set:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "https://YOUR_PROJECT_REFERENCE.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "PASTE_PUBLISHABLE_KEY"
```

These two values are intentionally browser-safe. Never use the Secret/service-role key in a `NEXT_PUBLIC_` variable.

Start Web and the developer control plane:

```powershell
corepack.cmd pnpm prototype
```

Open `http://127.0.0.1:3000/classroom`, sign in, create a session covering today, and copy its class code. Pair the teacher Host and copy the one-time Host ID/token.

## 5. Start the outbound Windows Host and Paper

Stop the previous command with `Ctrl+C`, then set the displayed Host values in the same protected PowerShell window:

```powershell
$env:BADGERBOTS_CLASSROOM_HOST_ID = "PASTE_HOST_ID"
$env:BADGERBOTS_CLASSROOM_HOST_TOKEN = "PASTE_HOST_TOKEN"
$env:BADGERBOTS_SUPABASE_PUBLISHABLE_KEY = $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
$env:BADGERBOTS_ACCEPT_MINECRAFT_EULA = "true"
$env:BADGERBOTS_TEACHER_MINECRAFT_USERNAME = "YourExactMinecraftName"
corepack.cmd pnpm prototype:minecraft
```

Expected logs include `Connected classroom Host ... polling outbound over authenticated HTTPS` and `Paper is ready`.

## 6. Test with a second computer

Until the static Web export is hosted, clone the same Git branch on the second computer, set only the two `NEXT_PUBLIC_` values, install dependencies, and run:

```powershell
corepack.cmd pnpm --filter @badgerbots/web dev
```

On that computer:

1. Open `http://127.0.0.1:3000/classroom`.
2. Join with the class code, `Test`, and `S`.
3. Open the block editor, change valid blocks, and wait 1.5 seconds for the cloud revision message.
4. Return to Connected Classroom. The instructor computer should show the student online and the new revision.
5. Open the student from the instructor dashboard, edit their blocks, and push.
6. Deliberately save from both computers from the same base revision. One must receive a conflict and preserve its local blocks.
7. Click Run. Within the idle five-second Host poll, the dashboard command should move from `pending`/`delivering` to `accepted`, and the real Minecraft behavior should update.
8. Click Stop and confirm events stop.
9. Ask for help as the student, then acknowledge and resolve it as the instructor.
10. Refresh both browsers and confirm Auth sessions and the canonical revision recover.

Do not expose ports `3000` or `4180` to the public Internet. The second computer independently loads the static Web application and both browsers communicate with Supabase over HTTPS.
