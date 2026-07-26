# BadgerBots Host

BadgerBots Host is the installed teacher-laptop application. Its native first-run workflow covers
service configuration, instructor sign-in, owner organization/location selection, Host pairing,
Windows-protected credential persistence, platform/RAM readiness probing, and managed Minecraft
server configuration without PowerShell or configuration-file editing.

Step 4 asks for the exact teacher Minecraft Java username, server port, memory limit, and explicit
Minecraft EULA acceptance. Host verifies the system Java 21 runtime and atomically creates a private
application-local runtime directory with restricted server settings. It never globally changes
Java or an existing Minecraft server.

Host 0.7.0 can download the pinned Paper build, verify its SHA-256, install the plugin embedded by
Windows CI, create a configuration recovery snapshot, and request a Private-network-only Windows
firewall rule through a normal UAC prompt. These actions happen in the app without PowerShell.

The final setup step performs a bounded real Paper smoke test: it verifies the Sheep City plugin,
authenticated local bridge, loopback listener, and clean shutdown while keeping redacted output in
the built-in console.

After setup, Host owns the long-running Paper process. **Start classroom server**, **Stop server**,
and **Verify and recover** are native controls. Starting and running output streams into the
in-app console in real time, with the newest 80 redacted lines retained. The console is read-only:
it does not execute arbitrary Paper, Java, or shell commands. A normal app close first asks Paper
to stop cleanly, and Windows sleep is inhibited only while the server is ready.

Host now creates a verified operational world snapshot before each normal server start. While
Paper is stopped, the Recovery panel can also create a backup, restore the latest snapshot, or
reset only Sheep City after first creating a recovery snapshot. Each file has SHA-256 evidence;
unknown paths and links are rejected; snapshots are limited to 100,000 files/4 GiB and the newest
five are retained.

Host does **not** yet create the encrypted/compressed final retention export, remove/repair the
firewall rule, install a private managed Java distribution, or install an update. Forced process
termination and power-loss recovery still need physical Windows drills.

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
