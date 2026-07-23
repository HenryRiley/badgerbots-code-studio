import * as Blockly from "blockly/core";
import * as English from "blockly/msg/en";

const definitions = [
  {
    type: "bb_event_projectile_hit",
    message0: "onProjectileHit() %1 { %2 %3 }",
    args0: [
      { type: "input_dummy" },
      { type: "input_dummy" },
      { type: "input_statement", name: "DO" },
    ],
    colour: "#1769aa",
    tooltip: "Runs when a projectile hits something in this private world.",
  },
  {
    type: "bb_event_player_move",
    message0: "onPlayerMove() %1 { %2 %3 }",
    args0: [
      { type: "input_dummy" },
      { type: "input_dummy" },
      { type: "input_statement", name: "DO" },
    ],
    colour: "#1769aa",
    tooltip: "Runs when the owner moves in this private world.",
  },
  {
    type: "bb_event_sheep_spawn",
    message0: "onSheepSpawn() %1 { %2 %3 }",
    args0: [
      { type: "input_dummy" },
      { type: "input_dummy" },
      { type: "input_statement", name: "DO" },
    ],
    colour: "#1769aa",
    tooltip: "Configures a Sheep City sheep when it appears.",
  },
  {
    type: "bb_event_sheep_death",
    message0: "onSheepDeath() %1 { %2 %3 }",
    args0: [
      { type: "input_dummy" },
      { type: "input_dummy" },
      { type: "input_statement", name: "DO" },
    ],
    colour: "#1769aa",
    tooltip: "Runs when a scoped Sheep City sheep is defeated.",
  },
  {
    type: "bb_explode_at_hit",
    message0: "explodeAtHit(%1);",
    args0: [{ type: "field_number", name: "POWER", value: 2, min: 0.5, max: 4, precision: 0.5 }],
    previousStatement: null,
    nextStatement: null,
    colour: "#247ba0",
    tooltip: "Creates a bounded explosion at the projectile hit location.",
  },
  {
    type: "bb_if_then",
    message0: "if (%1) %2 { %3 }",
    args0: [
      { type: "input_value", name: "CONDITION", check: "Boolean" },
      { type: "input_dummy" },
      { type: "input_statement", name: "DO" },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: "#356859",
    tooltip: "Runs the nested blocks when a Boolean condition is true.",
  },
  {
    type: "bb_equals",
    message0: "%1 == %2",
    args0: [
      { type: "input_value", name: "LEFT", check: "Material" },
      { type: "input_value", name: "RIGHT", check: "Material" },
    ],
    inputsInline: true,
    output: "Boolean",
    colour: "#356859",
    tooltip: "Compares two values of the same supported type.",
  },
  {
    type: "bb_get_material_under_player",
    message0: "getMaterialUnderPlayer()",
    output: "Material",
    colour: "#247ba0",
    tooltip: "Reads the block material directly below the owner.",
  },
  {
    type: "bb_material_gold_block",
    message0: "Material.GOLD_BLOCK",
    output: "Material",
    colour: "#b7791f",
    tooltip: "The Minecraft gold block material value.",
  },
  {
    type: "bb_bounce_player",
    message0: "player.bounce(%1);",
    args0: [
      { type: "field_number", name: "STRENGTH", value: 1.2, min: 0.1, max: 3, precision: 0.1 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: "#2f855a",
    tooltip: "Applies bounded upward velocity to the owner.",
  },
  {
    type: "bb_set_sheep_red",
    message0: "sheep.setColor(DyeColor.RED);",
    previousStatement: null,
    nextStatement: null,
    colour: "#6b46c1",
    tooltip: "Uses the supported vanilla red sheep presentation.",
  },
  {
    type: "bb_set_sheep_speed",
    message0: "sheep.setSpeedMultiplier(%1);",
    args0: [{ type: "field_number", name: "SPEED", value: 1.8, min: 0.1, max: 4, precision: 0.1 }],
    previousStatement: null,
    nextStatement: null,
    colour: "#6b46c1",
    tooltip: "Sets a bounded vanilla movement-speed multiplier.",
  },
  {
    type: "bb_drop_gold",
    message0: "dropItem(Material.GOLD_INGOT, %1);",
    args0: [{ type: "field_number", name: "QUANTITY", value: 1, min: 1, max: 16, precision: 1 }],
    previousStatement: null,
    nextStatement: null,
    colour: "#6b46c1",
    tooltip: "Drops a bounded number of gold ingots.",
  },
];

export function registerSheepCityBlocks() {
  Blockly.setLocale(English as unknown as Record<string, string>);
  const missing = definitions.filter((definition) => Blockly.Blocks[definition.type] === undefined);
  if (missing.length > 0) Blockly.common.defineBlocksWithJsonArray(missing);
}
