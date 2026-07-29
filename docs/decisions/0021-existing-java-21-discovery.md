# ADR 0021: reuse a compatible existing Java 21 runtime

- Status: Accepted for the Windows x64 internal prototype
- Date: 2026-07-29
- Amends: ADR 0020

## Context

ADR 0020 made the pinned private Eclipse Temurin runtime the only Paper runtime. That provides a
strong reproducibility boundary, but needlessly downloads and stores another Java runtime when the
teacher computer already has a working 64-bit Java 21 installation.

The Host must avoid changing Windows Java configuration and must not trust an executable merely
because it is named `java.exe` or appears on PATH.

## Decision

When no verified private runtime is already present, Host checks these bounded sources:

1. `JAVA_HOME`;
2. the paths returned by Windows `where.exe java.exe`; and
3. immediate runtime directories under standard Eclipse Adoptium, Java, Microsoft, Amazon
   Corretto, BellSoft, and Zulu folders in Program Files, plus the per-user Adoptium Programs
   folder.

Each candidate is canonicalized and must be a regular `java.exe`. Host directly runs it with
`-XshowSettings:properties -version` in a hidden process and accepts only Java major version 21
with `amd64` or `x86_64` architecture. Host records the canonical executable path and its SHA-256
in its own application data.

Paper uses that exact path. Before every launch, Host recomputes the executable checksum and repeats
the Java version/architecture probe. It does not modify, copy, update, register, or uninstall the
existing runtime. If the selected installation disappears or changes, launch fails closed and the
normal graphical prepare/repair path searches again before falling back to the checksum-pinned
private Temurin runtime from ADR 0020.

A valid existing private BadgerBots runtime remains preferred because it has complete per-file
verification and has already consumed the storage. This avoids destabilizing current installations.

## Consequences

- A computer with compatible Java 21 avoids the additional runtime download and storage.
- The source can be any compatible installed Java distribution; BadgerBots does not redistribute
  or make licensing claims about that user-installed copy.
- Existing Java may be removed or updated by another application. Checksum and process verification
  detect this before Paper starts; repair then selects another candidate or installs the pinned
  private fallback.
- Host now reads `JAVA_HOME`, PATH resolution, and bounded standard installation directories, but
  never writes them or changes Windows registry, PATH, file associations, or vendor files.
- The private pinned Temurin path remains the deterministic offline-repair fallback after its first
  successful acquisition.
