# Block editor

Checkpoint 1 implements thirteen original Blockly views for the Sheep City subset, the complete implemented searchable catalog, and bidirectional adapters for Player, Game, and Sheep scripts. The gold-bounce check uses four independently movable typed blocks: generic `if`, equality, material-under-player, and gold-block value. Unknown or incomplete blocks fail closed with an explicit no-code-discarded error.

Blockly workspace data is a view representation, never the source of truth. Tests cover block-to-text-to-block and text-to-block-to-text composition through the canonical AST.
