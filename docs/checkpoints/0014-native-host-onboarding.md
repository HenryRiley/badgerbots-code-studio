# Checkpoint 14: native Host onboarding

Status: implementation complete; deployed Edge update and physical Windows installer evidence
required

## Working in the repository

- The installed Tauri Host now provides a graphical classroom-service, sign-in, organization,
  location, and Host-pairing wizard.
- Passwords are used only for the active sign-in request and are never persisted.
- The one-time pairing token crosses directly from the Edge API into native Windows
  user-protected storage. It is never displayed in the webview or written as plaintext.
- Only a bare HTTPS Supabase Project URL and an `sb_publishable_` key are accepted. Secret keys are
  rejected.
- Release CI can inject the two public values through repository variables so a production
  installer starts at instructor sign-in rather than provider configuration.
- Native Windows platform/RAM probing replaces another manual setup step. It records a warning
  below the 16 GiB target and blocks below 12 GiB without claiming 25-student capacity.
- The Edge API accepts a dedicated native-onboarding client only for authenticated `profile` and
  owner-only `pair_host` actions.

## Automated evidence

- Host TypeScript tests cover public-service boundary validation and existing lifecycle safety.
- Rust tests cover service URL/key rejection and, on Windows CI, DPAPI protect/unprotect without
  plaintext retention.
- Strict TypeScript, Rustfmt, Clippy, Cargo tests, Vite production build, and Deno Edge checks are
  required in CI.
- The Windows NSIS job still produces a checksummed unsigned internal installer.

## Manual Windows verification

1. Redeploy the updated `classroom-api` Edge Function.
2. Set GitHub repository variables `BADGERBOTS_SUPABASE_URL` and
   `BADGERBOTS_SUPABASE_PUBLISHABLE_KEY`, then obtain the exact PR installer artifact.
3. Install as a normal user accepting the installer elevation prompt; launch from Start.
4. Confirm no terminal opens and no provider-value form appears in a preconfigured build.
5. Sign in, select the owner organization/location, name the laptop, and pair.
6. Close and reopen Host. Confirm it remains paired and does not show or log the token.
7. Run **Check this laptop** and record OS/RAM output.
8. Confirm an assistant cannot pair a new Host and a Secret key is rejected by an unconfigured
   internal build.
9. Inspect application-local data: the credential file must not contain the raw pairing token.

## Not yet claimed

- The Start button remains locked. Checkpoint 15 must bundle/verify the managed runtime, consume the
  protected credential in the outbound worker, add backup/recovery, and provide real lifecycle
  controls.
- Firewall approval, teacher Minecraft mapping, update signing, repair/rollback, Windows 10
  physical evidence, and SmartScreen/code signing remain open.
- This is a no-PowerShell instructor setup boundary, not yet the completed Sheep City installer
  acceptance.
