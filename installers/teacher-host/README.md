# Teacher Host installer

Checkpoint 4 uses Tauri 2 to produce an x64 NSIS `-setup.exe` on the pinned Windows CI runner. The prototype is configured as an intentional per-machine install and uses the system-serviced WebView2 runtime with the Evergreen bootstrapper fallback.

The pull-request workflow builds an **unsigned internal prototype**, records its SHA-256, and retains the artifact for 14 days. It is not a production release and may trigger Microsoft SmartScreen. Production distribution remains blocked on BadgerBots code-signing credentials, signature/timestamp verification, authenticated updates, repair/upgrade/uninstall testing, and physical Windows 10/11 evidence.

The current installer contains the real native classroom onboarding flow. In a build configured
with the public repository variables, an instructor can sign in, select a location, pair the
laptop, persist its DPAPI-protected Host credential, and run native platform/RAM checks without a
terminal. It does not yet bundle Java, Paper, the plugin, or a world, and it does not create a
firewall rule.

## Retrieving a CI prototype

1. Open the GitHub pull request and select its **Checks** tab.
2. Open **Unsigned Host NSIS prototype**.
3. Download `badgerbots-host-unsigned-windows-x64` from the workflow artifacts.
4. Verify the installer against the included `SHA256SUMS.txt` before testing.

## Required physical test record

Use `docs/checkpoints/0004-host-application-and-installer.md`. A non-developer must eventually complete sign-in, location, hardware, server configuration, teacher mapping, scoped firewall approval, test server, and Ready without editing configuration files. The present preview cannot pass that acceptance journey.
