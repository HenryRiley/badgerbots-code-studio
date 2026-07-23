# Instructor operations and recovery guide

Status: pre-release draft. Buttons or procedures that require unfinished Host/Paper integration
must not be presented as operational in the application.

## Before camp

1. Use the exact tested Host/Connect build and verify checksums.
2. Confirm Windows updates/restarts are complete, the laptop is plugged in, and at least the
   configured disk reserve is free.
3. Run Host readiness, managed artifact verification, backup restore check, local Wi-Fi test,
   teacher-world test, and a capacity check for expected enrollment.
4. Confirm the weekly session dates, owner/assistants, device mappings, and join code.
5. Do not activate a camp if provider recovery export, Paper smoke test, or backup verification
   fails.

## During camp

- Green capacity: normal admission.
- Warning capacity: inspect teacher-world response, tick time, memory, entities, and disk before
  admitting more students.
- Closed capacity: no new private worlds. Existing private boundaries and quotas remain intact.
- Cloud offline: existing last-known-good Minecraft behavior may continue locally. Do not tell
  students that new web changes have synchronized.
- Plugin crash: student runtime is stopped and new worlds are paused. Keep visitors out until
  recovery confirms zero stale scopes and reactivates a known-good version.
- Disk pressure: pause new worlds/deployments/backups; do not delete verified backups ad hoc.
- Corrupt world: quarantine it, retain the working copy/backup, verify the template checksum,
  restore to staging, then swap only after verification.

## Owner departure

Stop the owner program scope, route visitors out, clear visitor authorization, save/flush the
working state, then unload the private lease. The teacher world remains loaded.

## Evidence to retain

Keep build/checksum IDs, hardware facts, redacted correlation IDs, threshold events, backup
results, and recovery outcome. Do not retain child surnames, IP addresses, chat, Microsoft
credentials, or program bodies in troubleshooting bundles.
