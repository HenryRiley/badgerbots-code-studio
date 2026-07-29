# Checkpoint 7: scale and safety implementation slice

Status: local implementation and automated verification complete. Physical Checkpoint 7
acceptance is not claimed.

## Implemented in this slice

- A strategy-independent `PrivateWorldLease` model with separate-world and shared-instance
  allocators.
- Opaque owner/session/project scope, explicit owner-only edit authorization, owner-approved
  visitor entry, visitor eviction when the owner leaves, and shared-instance coordinate
  boundary rejection.
- A capacity controller that pauses new private-world admission when a candidate threshold or
  operational failure is exceeded. It never merges privacy boundaries or raises runtime quotas.
- A deterministic 25-student Sheep City workload covering join, Run, steady activity,
  visitors, reverse-order disconnect, and recovery.
- A physical-evidence schema and analyzer for RAM, heap, CPU, tick duration/TPS, chunk
  load/unload, entities, disk, Run latency, and teacher responsiveness.
- Fail-closed strategy selection: separate worlds remain preferred only if they pass; shared
  instances may be selected only if their own isolation and performance evidence passes.
- Runtime scope cleanup continues after an individual resource cancellation throws, and reports
  cleanup failure counts.
- Host safe-degradation state for cloud loss, plugin crash/recovery, disk pressure, corrupt-world
  quarantine, and capacity closure.
- A bounded redacted outbound queue that protects audit/runtime events and rejects sensitive
  payload fields.

## Evidence boundary

Synthetic samples exercise policy code only. They can never set a strategy report to accepted.
Production selection requires both strategies to run through Paper on the same supported
Windows 10/11 x64, 16 GB-class teacher laptop with exact artifact checksums.

The current Sheep City world is still `asset-required`, the Paper adapter is not yet
server-verified, and the Host does not yet collect the defined probe metrics. Therefore no
student-count or world-strategy support claim is made.

## Automated verification

- `pnpm verify` passed on macOS on 2026-07-23: formatting, metadata, all workspace type checks,
  lint, tests, repository tests, and secret scanning.
- The workspace run passed 104 Vitest assertions, five Rust unit tests, three repository-tool
  tests, and the Java runtime core self-test.
- Focused fault tests proved that a simulated Paper failure disconnects all 25 students, calls
  recovery and finish, and preserves the primary failure while reporting cleanup failures.
- The load-simulator CLI built and emitted the exact 25-student plan with baseline, join, Run,
  steady, visitor, disconnect, and recovery phases.

## Deferred physical verification

- Run the 25-student scenario for both strategies on minimum Windows/Paper hardware.
- Inject Wi-Fi/cloud loss, plugin/Host crash, disk pressure, corrupt world data, and failed
  scoped-resource cancellation.
- Record teacher-world responsiveness and prove every owner disconnect leaves zero active
  program scopes/resources.
- Perform installer repair/upgrade/rollback on clean Windows 10 and Windows 11 machines.

## Acceptance mapping

| Checkpoint 7 requirement                   | Local implementation evidence                       | Acceptance state              |
| ------------------------------------------ | --------------------------------------------------- | ----------------------------- |
| 25-student load simulator                  | Deterministic scenario and driver contract          | Physical driver/evidence open |
| Compare both world strategies              | Lease implementations and evidence analyzer         | Selection intentionally open  |
| Capacity/degradation policy                | Threshold controller and Host resilience model      | Paper/Host integration open   |
| Runtime leak/circuit-breaker safety        | TS/Java cancellation continuation and counters      | Real soak test open           |
| Wi-Fi/cloud/crash/disk/corruption recovery | Deterministic Host policy and queue                 | Physical drills open          |
| Threat model and operations guidance       | Checkpoint 7 threat model and operations guide      | Review open                   |
| Release candidate                          | No release claim while earlier checkpoint gaps open | Not accepted                  |
