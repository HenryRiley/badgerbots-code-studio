# Restricted Java-style DSL

Checkpoint 1 implements the Sheep City instructor parser and deterministic formatter. Stable program/node IDs are represented as controlled metadata comments so blocks and text round-trip without semantic loss.

Composable conditions format as Java-style expressions such as `getMaterialUnderPlayer() == Material.GOLD_BLOCK`; controlled expression-ID comments preserve the independent equality and operand block identities. Events use allowlisted method declarations such as `void onSheepDeath()` rather than executable Java classes.

The grammar resembles Java but is parsed only into the canonical BadgerBots AST. Imports, classes, arbitrary loops/objects, reflection, files, networking, processes, threads, and unsupported syntax are rejected with line/column diagnostics. This text is never compiled or executed as Java.
