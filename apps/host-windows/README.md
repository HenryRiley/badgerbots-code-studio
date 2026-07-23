# BadgerBots Host

Checkpoint 4 desktop application for the teacher laptop. The current slice provides a Tauri 2 shell, original BadgerBots UI, ordered first-run setup model, readiness evaluation, guarded server lifecycle state machine, redacted diagnostics, crash-recovery state, update/back-up status contracts, and atomic local state persistence in the native shell.

It does **not** yet start Paper, change the Windows firewall, prevent sleep, download artifacts, create backups, or install an update. Those controls are visibly marked unavailable until the Host-to-Paper bridge, checksummed artifacts, and Windows tests exist. No placeholder control is presented as successful infrastructure.

## Browser preview

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows dev
```

Open <http://127.0.0.1:1420>. Browser preview state is intentionally in-memory and labelled as such.

## Native development

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows tauri dev
```

The native shell stores only non-secret setup/status data under the application-local data directory using atomic replacement. Authentication tokens and pairing credentials are not implemented or persisted in this slice.

## Checks

```sh
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows test
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows typecheck
npx --yes pnpm@11.16.0 --filter @badgerbots/host-windows native:check
```

Windows installer output remains a Windows CI/manual-test gate. An unsigned prototype must be labelled internal and may trigger SmartScreen.
