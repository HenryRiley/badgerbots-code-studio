# ADR 0018: Host world backup, restore, and reset

- Status: Accepted for the internal prototype
- Date: 2026-07-26

## Context

The native Host owns the Paper process, but a real classroom world can still be damaged by an
operator mistake, a failed experiment, disk corruption, or an interrupted server lifecycle.
Configuration-only recovery evidence does not protect Minecraft region, player, or plugin world
data. Teachers also need a graphical Sheep City reset without deleting folders in PowerShell.

## Decision

Host 0.7.1 manages operational snapshots for four fixed world roots: the teacher overworld,
teacher Nether, teacher End, and the original Sheep City prototype. Backup, restore, and reset are
allowed only while the supervised Paper process is stopped and all setup gates are complete.

Every regular file is copied to a staging directory and recorded in a versioned manifest with its
relative path, byte length, and SHA-256. Symbolic links, junction-like links, special files,
absolute/traversal paths, unknown world roots, more than 100,000 files, and more than 4 GiB of
world data fail closed. `session.lock` is intentionally excluded.

A backup becomes visible only after all staged files match its manifest. Its manifest identifies
why it was created: automatic pre-start, manual, before Sheep City reset, or crash recovery. Host
retains the newest five operational snapshots and automatically creates one before a normal
server start. Teachers select a timestamped recovery point instead of implicitly restoring the
newest snapshot. Restore resolves that opaque ID through the managed inventory, re-verifies the
selected snapshot, stages a complete replacement, moves current world roots into a rollback
directory, and then commits only fixed world names. A failure attempts to restore every previous
root.

Reset Sheep City first creates and verifies a complete recovery snapshot, then removes only the
fixed Sheep City working directory. The plugin regenerates the original procedural prototype on
the next start. That next start preserves the pre-reset snapshot instead of replacing it with an
incomplete snapshot.

## Consequences

- Teachers can back up, restore, and reset Sheep City entirely in the Host app.
- A manual backup made after damage does not hide the earlier intact recovery point.
- A damaged or modified backup cannot silently replace working worlds.
- Operational snapshots are bounded by count, file count, and total bytes.
- These local directory snapshots are not the encrypted/compressed final retention export required
  for production child-data deletion. That export, backup tombstones, disk-pressure handling,
  power-loss recovery, and physical Windows restore evidence remain separate release gates.
