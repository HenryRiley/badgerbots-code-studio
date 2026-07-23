# ADR 0008: World strategy experiment and abstraction

Status: accepted on 2026-07-22.

## Decision

Expose a `PrivateWorldLease` abstraction to routing, runtime scopes, visitors, reset, progress, and UI. Two implementations must be benchmarked before selecting the production default:

1. one compact, pre-generated, unloadable world copy per active student; and
2. protected, widely separated instances in a bounded pool of shared worlds.

The benchmark uses the same immutable Sheep City template, scripted workload, quotas, view/simulation distances, and 25 simulated owners plus representative visitors. Capture process RAM and JVM heap, CPU, tick percentiles/TPS, chunk load/unload, entities, disk amplification, Run latency, world reset/unload time, and teacher-world responsiveness.

## Safety and degradation

Every runtime scope is keyed by session, project, student, program version, and logical private-world lease, not a filesystem world name. Crossing instance boundaries is rejected. If hardware thresholds are crossed, stop accepting new private leases and surface a teacher-visible capacity state; do not silently merge privacy boundaries or weaken quotas.

## Selection gate

Checkpoint 7 selects a default only after tests on the minimum Windows 10, 16 GB, i5/i7 teacher laptop. Prefer per-student worlds if the teacher world remains responsive and memory/disk/load latency stay inside recorded limits; otherwise select shared instances only after isolation, visitor, cleanup, and reset tests pass.
