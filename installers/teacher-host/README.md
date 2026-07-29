# Teacher Host installer

Checkpoint 4 uses Tauri 2 to produce an x64 NSIS `-setup.exe` on the pinned Windows CI runner. The prototype is configured as an intentional per-machine install and uses the system-serviced WebView2 runtime with the Evergreen bootstrapper fallback.

The pull-request workflow builds an **unsigned internal prototype**, records its SHA-256, and retains the artifact for 14 days. It is not a production release and may trigger Microsoft SmartScreen. Production distribution remains blocked on BadgerBots code-signing credentials, signature/timestamp verification, authenticated updates, repair/upgrade/uninstall testing, and physical Windows 10/11 evidence.

The current installer contains the real native classroom onboarding flow. In a build configured
with the public repository variables, an instructor can sign in, select a location, pair the
laptop, persist its DPAPI-protected Host credential, run native platform/RAM checks, download and
verify pinned Paper, install the CI-built BadgerBots plugin, and approve a scoped Private-network
firewall rule without a terminal. It does not bundle Java, Paper, or a final world. It does not yet
provide permanent camp server controls or prove firewall repair/removal. Host 0.5.0 does run a
bounded graphical Paper test and requires Paper, Sheep City plugin, authenticated bridge, loopback
listener, and clean-shutdown evidence before completing setup.

## Retrieving a CI prototype

1. Open the GitHub pull request and select its **Checks** tab.
2. Open **Unsigned Host NSIS prototype**.
3. Download `badgerbots-host-unsigned-windows-x64` from the workflow artifacts.
4. Verify the installer against the included `SHA256SUMS.txt` before testing.

## Required physical test record

Use `docs/checkpoints/0004-host-application-and-installer.md`. A non-developer must complete
sign-in, location, hardware, server configuration, teacher mapping, scoped firewall approval, test
server, and Ready without editing configuration files. Browser preview is not acceptance evidence;
the Host 0.5.0 installer must run the real Paper smoke test on Windows.
