# ADR 0023: One plugin stack, many scoped programs and world instances

Status: Accepted for prototype architecture; world-strategy benchmark remains open

Date: 2026-07-29

## Context

Campers need private projects that can run different student-authored behaviors simultaneously.
Paper plugins and Minecraft server mods are loaded for the whole server process, not independently
for each Bukkit world. Treating each student's program as a plugin or mod would make isolation,
atomic updates, cancellation, and classroom performance unsafe.

## Decision

One managed Paper server loads one pinned BadgerBots plugin and one compatible server/plugin stack.
Student code is canonical AST data compiled to a restricted instruction graph. The shared plugin
interprets many graphs concurrently, keyed by organization, location, session, project, student,
program version, and world.

Multiple Bukkit worlds or protected spatial instances may share this plugin because event routing,
entities, tasks, quotas, and mutable actions are checked against the execution scope. Different
student programs therefore do not require different plugin JARs.

If a future project truly requires a different mod loader, Minecraft version, or incompatible
plugin set, it must run in a separate server process. World-level plugin or mod loading inside one
Paper process is not a supported isolation boundary.

## Current implementation boundary

The core runtime can hold multiple scoped active programs, but Sheep City still creates one
prototype world and the file bridge currently selects the first connected player. Therefore
private per-camper world routing is **not yet implemented** and must not be presented as complete.

Before multi-camper acceptance, the plugin must:

1. resolve the cloud camper/device mapping to the exact Minecraft player;
2. allocate or restore that camper's working world/instance;
3. use the resolved player and actual world UUID in every execution scope;
4. route all player/entity events through that scope;
5. stop tasks and handle visitors before unloading the owner's world; and
6. pass the 25-student separate-world versus protected-instance benchmark on the Windows 10
   teacher-laptop envelope.

## Consequences

This keeps educational programs hot-swappable without restarting Paper and makes one-server
operation technically possible. The benchmark—not preference—will decide whether 25 campers use
separate unloadable worlds, protected instances, or a documented degraded hybrid.
