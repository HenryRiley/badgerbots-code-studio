# Checkpoint 7 Windows/Paper benchmark procedure

## Purpose

Compare one unloadable private world per camper with protected shared-world instances without
changing the student-facing private-world abstraction. Do not use synthetic metrics to make a
support claim.

## Required machine record

Record the opaque Host machine ID and benchmark-run ID, exact Git commit, Windows edition/build,
CPU model, installed RAM, power mode, Java version, Paper build and SHA-256, plugin SHA-256,
view distance, simulation distance, Wi-Fi adapter/driver, free disk before/after, and whether
antivirus scanning was active. Both strategies must use the same machine, run ID, commit, and
Paper configuration. Do not record camper names, usernames, Microsoft accounts, IP addresses,
chat, credentials, or program bodies.

## Workload

Generate the deterministic workload plan:

```powershell
npx --yes pnpm@11.16.0 --filter @badgerbots/load-simulator plan
```

For each strategy, use a clean working-world root and the same immutable Sheep City template.
Run baseline, sequential joins 1-25, a Run and all four Sheep City handlers per student, steady
activity, two owner-approved visits, reverse-order disconnect/unload, and recovery. Collect at
least one sample at every active count from 0 through 25 and every named phase.

The eventual Paper/Host probe must populate the versioned `HardwareEvidence` contract from
`tools/load-simulator/src/index.ts`. Until that probe exists, capture results manually but do
not convert them into accepted evidence.

Analyze two completed evidence files:

```powershell
npx --yes pnpm@11.16.0 --filter @badgerbots/load-simulator exec `
  badgerbots-load-simulator analyze separate-worlds.json shared-instances.json
```

## Candidate thresholds

The initial conservative thresholds leave OS and teacher-world headroom on a 16 GB-class
machine: process resident memory 10 GiB, Java heap 8 GiB, CPU p95 80%, tick p95 45 ms, minimum
TPS 19.5, chunk load/unload p95 2 seconds, Run p95 750 ms, teacher action p95 250 ms, 2,500
entities, and 8 GiB disk amplification.

These are acceptance candidates, not measured claims. Tighten them when classroom evidence
supports doing so. Do not loosen privacy, scope, or circuit-breaker limits to make a run pass.

## Degraded outcome

If either strategy crosses a threshold, stop admitting new private leases and show the reason
to the instructor. If neither strategy passes with 25 students, cap supported enrollment below
25 and re-run. Never silently place unrelated campers in one editable area, make private worlds
visible, retain owner scripts after departure, or unload the teacher world.
