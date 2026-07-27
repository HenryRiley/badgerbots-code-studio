# ADR 0019: Non-destructive working-world initialization

- Status: Accepted for the internal prototype
- Date: 2026-07-27

## Context

Sheep City began as a procedural prototype. The Paper plugin previously executed every layout
write on every server start. That made the first launch convenient, but it also replaced legitimate
working-world changes after Paper loaded a saved or restored world. A checksummed restore could
therefore select the correct snapshot and still appear incorrect because plugin startup rebuilt its
fences and other prototype blocks.

## Decision

The plugin checks whether the fixed Sheep City world directory exists before asking Paper to load
it. The original layout is built only when that directory is absent. After loading, the world
receives a namespaced initialization marker and is explicitly saved.

An existing directory always fails toward preservation, including a legacy world without the new
marker and a restored snapshot. The marker is supporting evidence rather than authority to rewrite
blocks. Host's explicit Sheep City Reset remains the regeneration operation: it first creates a
verified backup, removes only the fixed Sheep City directory while Paper is stopped, and lets the
next start create a new world and layout.

## Consequences

- Ordinary Paper restarts preserve instructor and student block changes.
- Restoring either an intact or visibly modified snapshot remains observable after the next start.
- Upgrading an existing prototype does not perform a one-time destructive rebuild.
- An incomplete pre-existing world is preserved rather than silently repaired. The instructor must
  use verified Restore or explicit Reset.
- Immutable template export and per-camper daily working copies remain later release work.
