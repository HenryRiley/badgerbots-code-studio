# BadgerBots Host

BadgerBots Host is the installed teacher-laptop application. Its native first-run workflow covers
service configuration, instructor sign-in, owner organization/location selection, Host pairing,
Windows-protected credential persistence, platform/RAM readiness probing, and managed Minecraft
server configuration without PowerShell or configuration-file editing.

Step 4 asks for the exact teacher Minecraft Java username, server port, memory limit, and explicit
Minecraft EULA acceptance. Host atomically creates a private application-local runtime directory
with restricted server settings. The next graphical step first checks `JAVA_HOME`, PATH, and
standard vendor folders for an existing 64-bit Java 21 runtime. It verifies the executable,
records its SHA-256, and uses that exact path without modifying it. If no compatible runtime is
available, Host downloads Eclipse Temurin JRE 21.0.11+10, verifies its pinned archive SHA-256, and
installs it only below the BadgerBots directory.

Host 0.9.0 can reuse a verified existing Java 21 runtime or download the pinned Java and Paper
builds, verify their SHA-256 values, install the
plugin embedded by Windows CI, create a configuration recovery snapshot, and request a
Private-network-only Windows firewall rule through a normal UAC prompt. Java download, installed
file verification, and repair progress stay inside the app without PowerShell.

The final setup step performs a bounded real Paper smoke test: it verifies the Sheep City plugin,
authenticated local bridge, loopback listener, and clean shutdown while keeping redacted output in
the built-in console.

After setup, Host owns the long-running Paper process. **Start classroom server**, **Stop server**,
and **Verify and recover** are native controls. Starting and running output streams into the
in-app console in real time, with the newest 80 redacted lines retained. The console is read-only:
it does not execute arbitrary Paper, Java, or shell commands. A normal app close first asks Paper
to stop cleanly, and Windows sleep is inhibited only while the server is ready.

When Paper reaches Ready, Host 0.9.0 also starts the installed outbound classroom worker. It reads
the protected pairing credential natively, verifies signed cloud commands, compiles the supported
canonical AST, signs the separate local Paper request, and reports connection/command status in
the server card. This installed path needs no repository checkout, environment variables, Node.js,
pnpm, PowerShell, or exposed laptop web port. A cloud outage leaves Paper and its last-known-good
program running while Host retries outbound.

The worker now synchronizes an authenticated, signed set of at most 25 current
camper/device/Minecraft routes. Run and Stop carry the exact camper and Minecraft username to
Paper; Paper rejects missing, stale, ambiguous, or offline routes. The Host console also exposes
two fixed capacity controls—**Test 25 private worlds** and **Test shared instances**—without
accepting arbitrary console input. Each writes an 80-sample JSON evidence file below the plugin's
private `benchmarks` directory and reports its path in the built-in console.

Host now creates a verified operational world snapshot before each normal server start. While
Paper is stopped, the Recovery panel can also create a backup, select and restore any retained
snapshot, or reset only Sheep City after first creating a recovery snapshot. Every recovery point
shows its local time, reason, size, and world count. A manual-backup warning explains that it
captures the current state and should not be used after damage when an earlier snapshot is wanted.
Each file has SHA-256 evidence;
unknown paths and links are rejected; snapshots are limited to 100,000 files/4 GiB and the newest
five are retained.

The embedded Paper plugin creates the prototype layout only when the Sheep City world directory is
new. It preserves working-world and restored-snapshot block state on ordinary starts. The
graphical Reset action remains the explicit path that removes Sheep City and requests regeneration.

Before every Paper start, Host verifies the selected Java executable and its recorded SHA-256. An
existing runtime that disappears or changes is rejected and graphical preparation searches again,
then falls back to the pinned private runtime if necessary. A selected private runtime still
receives complete per-file verification and staged repair. **Verify & repair Java** provides the
same operation on demand while Paper is stopped. Paper launches the exact verified path recorded
by Host and never resolves `java` dynamically at launch time.

Host does **not** yet create the encrypted/compressed final retention export, remove/repair the
firewall rule, or install an authenticated application update. Forced process termination,
power-loss recovery, Java repair, and uninstall cleanup still need physical Windows drills.

Host sign-in trims and normalizes the instructor email and delegates password policy to Supabase
instead of imposing a separate local minimum. Supabase Auth error codes are mapped to specific,
safe recovery guidance for invalid credentials, unconfirmed or disabled accounts, rate limiting,
service outages, and rejected public keys. An unpaired Host can select **Change service
connection** on the sign-in screen to replace a stale Project URL or Publishable key without
PowerShell or deleting application data.

## Browser preview

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows dev
```

Open <http://127.0.0.1:1420>. Browser preview state is intentionally in-memory and labelled as such.

## Native development

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows tauri dev
```

The native shell stores non-secret setup/status data under the application-local data directory
using atomic replacement. The instructor password and Auth session remain memory-only. On Windows,
the Host pairing credential is encrypted with current-user DPAPI before atomic persistence and is
never returned to the webview.

The managed Minecraft runtime is stored below the same application-local data root in
`minecraft-runtime`. Host writes `eula.txt`, `server.properties`, and
`badgerbots-runtime.json`; it also prepares private plugin, bridge, and backup directories. The
teacher username is metadata and is never used as a file path.

Paper remains downloaded rather than redistributed. The installer embeds only the BadgerBots-owned
plugin compiled from the same commit. An internal build that omits the plugin fails closed during
runtime preparation.

Production installer builds should set the public repository variables
`BADGERBOTS_SUPABASE_URL` and `BADGERBOTS_SUPABASE_PUBLISHABLE_KEY`; CI maps them to Vite build
values. Internal unconfigured builds provide a graphical form and reject Secret keys.

Installed release builds use the Windows GUI subsystem, so launching BadgerBots Host or Paper does
not open a Command Prompt window. Paper output belongs in the redacted **Live server console** and
Host operations appear under **Recent events**. Development builds may still write diagnostics to
the terminal that launched them.

## Checks

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows test
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows typecheck
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows native:check
```

Windows installer output remains a Windows CI/manual-test gate. An unsigned prototype must be labelled internal and may trigger SmartScreen.
