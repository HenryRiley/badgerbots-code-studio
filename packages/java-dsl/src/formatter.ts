import {
  normalizeProgram,
  type EventNode,
  type Program,
  type ScriptNode,
  type StatementNode,
} from "@badgerbots/program-model";

const indent = (depth: number) => "  ".repeat(depth);
const formatNumber = (value: number) =>
  Number.isInteger(value) ? value.toFixed(1) : String(value);

function formatStatement(statement: StatementNode, depth: number): string[] {
  const prefix = indent(depth);
  const metadata = `${prefix}// @id: ${statement.id}`;
  switch (statement.nodeType) {
    case "explode_at_hit":
      return [metadata, `${prefix}explodeAtHit(${formatNumber(statement.power)});`];
    case "bounce_player":
      return [metadata, `${prefix}player.bounce(${formatNumber(statement.verticalVelocity)});`];
    case "if_then":
      return [
        metadata,
        `${prefix}// @expression-id: ${statement.condition.id}`,
        `${prefix}// @expression-id: ${statement.condition.left.id}`,
        `${prefix}// @expression-id: ${statement.condition.right.id}`,
        `${prefix}if (getMaterialUnderPlayer() == Material.GOLD_BLOCK) {`,
        ...statement.then.flatMap((child) => formatStatement(child, depth + 1)),
        `${prefix}}`,
      ];
    case "set_sheep_color":
      return [metadata, `${prefix}sheep.setColor(DyeColor.RED);`];
    case "set_sheep_speed":
      return [
        metadata,
        `${prefix}sheep.setSpeedMultiplier(${formatNumber(statement.multiplier)});`,
      ];
    case "drop_item":
      return [metadata, `${prefix}dropItem(Material.GOLD_INGOT, ${statement.quantity});`];
  }
}

function formatEvent(event: EventNode, depth: number): string[] {
  const names: Record<EventNode["nodeType"], string> = {
    projectile_hit_event: "onProjectileHit",
    player_move_event: "onPlayerMove",
    sheep_spawn_event: "onSheepSpawn",
    sheep_death_event: "onSheepDeath",
  };
  const prefix = indent(depth);
  return [
    `${prefix}// @id: ${event.id}`,
    `${prefix}void ${names[event.nodeType]}() {`,
    ...event.body.flatMap((statement) => formatStatement(statement, depth + 1)),
    `${prefix}}`,
  ];
}

function formatScript(script: ScriptNode): string[] {
  return [
    `  // @id: ${script.id}`,
    `  script ${script.displayName} {`,
    ...script.body.flatMap((event, index) => [
      ...(index > 0 ? [""] : []),
      ...formatEvent(event, 2),
    ]),
    "  }",
  ];
}

export function formatProgram(program: Program): string {
  const canonical = normalizeProgram(program);
  return [
    `// @program-id: ${canonical.programId}`,
    "program SheepCity {",
    ...canonical.scripts.flatMap((script, index) => [
      ...(index > 0 ? [""] : []),
      ...formatScript(script),
    ]),
    "}",
    "",
  ].join("\n");
}
