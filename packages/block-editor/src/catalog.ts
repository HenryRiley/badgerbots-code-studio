export interface BlockCatalogEntry {
  type: string;
  label: string;
  category: "Events" | "World" | "Player" | "Sheep" | "Logic" | "Values";
  keywords: string[];
  implemented: true;
}

export const blockCatalog: BlockCatalogEntry[] = [
  {
    type: "bb_event_projectile_hit",
    label: "onProjectileHit()",
    category: "Events",
    keywords: ["arrow", "hit", "projectile"],
    implemented: true,
  },
  {
    type: "bb_event_player_move",
    label: "onPlayerMove()",
    category: "Events",
    keywords: ["walk", "move", "player"],
    implemented: true,
  },
  {
    type: "bb_event_sheep_spawn",
    label: "onSheepSpawn()",
    category: "Events",
    keywords: ["create", "entity", "spawn"],
    implemented: true,
  },
  {
    type: "bb_event_sheep_death",
    label: "onSheepDeath()",
    category: "Events",
    keywords: ["death", "drop", "entity"],
    implemented: true,
  },
  {
    type: "bb_explode_at_hit",
    label: "explodeAtHit(power);",
    category: "World",
    keywords: ["boom", "explosion", "location"],
    implemented: true,
  },
  {
    type: "bb_if_then",
    label: "if (condition) { … }",
    category: "Logic",
    keywords: ["condition", "control", "then"],
    implemented: true,
  },
  {
    type: "bb_equals",
    label: "left == right",
    category: "Logic",
    keywords: ["compare", "condition", "left", "right"],
    implemented: true,
  },
  {
    type: "bb_get_material_under_player",
    label: "getMaterialUnderPlayer()",
    category: "World",
    keywords: ["block", "get", "material", "player", "under"],
    implemented: true,
  },
  {
    type: "bb_material_gold_block",
    label: "Material.GOLD_BLOCK",
    category: "Values",
    keywords: ["block", "gold", "material", "value"],
    implemented: true,
  },
  {
    type: "bb_bounce_player",
    label: "player.bounce(strength);",
    category: "Player",
    keywords: ["jump", "velocity", "launch"],
    implemented: true,
  },
  {
    type: "bb_set_sheep_red",
    label: "sheep.setColor(DyeColor.RED);",
    category: "Sheep",
    keywords: ["color", "red", "wool"],
    implemented: true,
  },
  {
    type: "bb_set_sheep_speed",
    label: "sheep.setSpeedMultiplier(value);",
    category: "Sheep",
    keywords: ["fast", "movement", "speed"],
    implemented: true,
  },
  {
    type: "bb_drop_gold",
    label: "dropItem(Material.GOLD_INGOT, quantity);",
    category: "Sheep",
    keywords: ["death", "drop", "gold", "item"],
    implemented: true,
  },
];

export function searchBlockCatalog(query: string): BlockCatalogEntry[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return blockCatalog;
  return blockCatalog.filter((entry) => {
    const haystack = [entry.label, entry.category, ...entry.keywords].join(" ").toLocaleLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export function createToolbox(query = "") {
  const matches = searchBlockCatalog(query);
  const categories = ["Events", "Logic", "Values", "World", "Player", "Sheep"] as const;
  const colours: Record<(typeof categories)[number], string> = {
    Events: "#1769aa",
    Logic: "#356859",
    Values: "#b7791f",
    World: "#247ba0",
    Player: "#2f855a",
    Sheep: "#6b46c1",
  };
  return {
    kind: "categoryToolbox",
    contents: categories
      .map((category) => ({
        kind: "category",
        name: category,
        colour: colours[category],
        contents: matches
          .filter((entry) => entry.category === category)
          .map((entry) => ({ kind: "block", type: entry.type })),
      }))
      .filter((category) => category.contents.length > 0),
  };
}
