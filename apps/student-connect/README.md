# BadgerBots Connect

Checkpoint 5 Tauri 2 helper for fixed student laptops. The current slice creates a stable opaque device ID in native app-local storage, detects the standard Prism Launcher data root without editing it, models instructor-authorized Minecraft username mapping, validates managed-only profile repair plans, and displays readiness plus redacted diagnostics inside the application.

Installed release builds do not open a Windows Command Prompt. Operational information belongs in the in-app diagnostics panel. Developer builds may use their launching terminal.

The current slice does **not** download Prism, create or alter an instance, install a mod, add a server entry, authenticate an instructor, or launch Minecraft. Those operations stay visibly locked until exact profile/mod artifacts, checksums, backup/rollback behavior, and Windows evidence exist.

## Browser preview

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/student-connect dev
```

Open <http://127.0.0.1:1430>. Browser state is explicitly ephemeral and performs no launcher discovery.

## Native development

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/student-connect tauri dev
```

The native app stores `device-identity.json` under its application-local data directory. It contains an opaque random device ID and, eventually, an instructor-approved Minecraft username. It never contains a Microsoft password or weekly camper identity.

## Checks

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/student-connect test
npx --yes pnpm@11.16.0 --filter @badgerbots/student-connect typecheck
npx --yes pnpm@11.16.0 --filter @badgerbots/student-connect build
```
