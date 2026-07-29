# ADR 0013: native Host onboarding and credential storage

Status: accepted for the Windows prototype.

## Decision

BadgerBots Host owns classroom service configuration, instructor sign-in, location selection, and
Host pairing inside its Tauri application. Instructors do not set environment variables, edit
configuration files, install Node.js, or run a package manager.

The native Rust boundary performs Supabase Auth and the two allowlisted onboarding Edge actions.
The instructor password and Auth session stay in memory and are discarded after setup or app exit.
The long-lived Host pairing credential is serialized separately and protected with Windows DPAPI
for the current Windows account before atomic local persistence. It is never returned to the
webview after pairing.

The Supabase Project URL and Publishable key are not secrets. Internal installers may receive them
as repository-level build variables. An unconfigured internal build exposes a graphical advanced
setup form that rejects Secret/service-role keys. Production BadgerBots builds should preconfigure
both public values.

## Consequences

- Reinstall/upgrade can preserve Host pairing in application-local data for the same Windows
  account.
- Moving the protected file to another account or machine does not transfer authority.
- An administrator-reset Windows password can make existing DPAPI data unrecoverable; the recovery
  path is instructor-authorized re-pairing, not weaker machine-wide encryption.
- macOS remains a development platform, but real credential persistence is intentionally unavailable
  there because BadgerBots Host is a Windows product.
- Paper lifecycle, firewall approval, managed runtime acquisition, backup, and update signing remain
  separate safety gates. Pairing does not make the server Start button operational.

## Rejected alternatives

- Plaintext JSON or environment-variable Host tokens: too easy to leak through support logs and
  process inheritance.
- Browser-local storage: the webview is not the credential authority.
- Machine-wide DPAPI scope: any Windows account on the teacher laptop could decrypt the token.
- Shipping a service-role key: it bypasses tenant RLS and is never appropriate in a desktop build.
