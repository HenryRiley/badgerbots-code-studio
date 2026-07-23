# Canonical program model

The authoritative versioned AST shared by every editor and runtime component. Checkpoint 1 now uses schema version 2, stable node IDs, deterministic serialization, lossless version 0/1 migrations, semantic placement rules, typed Boolean/material expressions, and bounded Sheep City values for projectile explosions, gold-block bounce, and sheep presentation/drop behavior.

The gold-bounce condition is composed from independent `if_then`, `equals`, `get_material_under_player`, and `material_literal` nodes rather than a project-specific shortcut. The schema requires Player, Game, and Sheep scripts and rejects duplicate IDs/events, missing or misplaced scripts/events/actions, type/shape errors, unsafe numeric values, excess nesting, and oversized programs with friendly diagnostics. General diff/merge behavior belongs to the cloud concurrency checkpoint.
