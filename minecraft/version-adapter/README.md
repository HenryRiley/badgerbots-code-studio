# Minecraft version adapter

Boundary between the educational runtime and Paper/Minecraft APIs. ADR 0007 currently proposes Minecraft/Paper 1.21.11 with Java 21; `toolchain-candidate.yaml` records the machine-readable spike state. Paper-specific calls stay in `minecraft/paper-plugin/src/paper` while the instruction interpreter remains API-independent.

This is not a release lock. Exact Paper server build, Gradle wrapper, managed JRE archive, client loader/profile versions, licenses, SHA-256 checksums, Windows launch, and real server behavior remain pending. Fields marked `pending` are deliberate release blockers.
