# BadgerBots Host

BadgerBots Host is the installed teacher-laptop application. Its native first-run workflow covers
service configuration, instructor sign-in, owner organization/location selection, Host pairing,
Windows-protected credential persistence, platform/RAM readiness probing, and managed Minecraft
server configuration without PowerShell or configuration-file editing.

Step 4 asks for the exact teacher Minecraft Java username, server port, memory limit, and explicit
Minecraft EULA acceptance. Host verifies the system Java 21 runtime and atomically creates a private
application-local runtime directory with restricted server settings. It never globally changes
Java or an existing Minecraft server.

It does **not** yet download or start Paper, change the Windows firewall, prevent sleep, acquire the
plugin, create backups, or install an update. Those controls remain visibly locked until their
verified native implementations exist.

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

Production installer builds should set the public repository variables
`BADGERBOTS_SUPABASE_URL` and `BADGERBOTS_SUPABASE_PUBLISHABLE_KEY`; CI maps them to Vite build
values. Internal unconfigured builds provide a graphical form and reject Secret keys.

Installed release builds use the Windows GUI subsystem, so launching BadgerBots Host does not open a Command Prompt window. Operational events belong in the app's redacted **Recent events** panel. Development builds may still write diagnostics to the terminal that launched them.

## Checks

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows test
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows typecheck
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows native:check
```

Windows installer output remains a Windows CI/manual-test gate. An unsigned prototype must be labelled internal and may trigger SmartScreen.
