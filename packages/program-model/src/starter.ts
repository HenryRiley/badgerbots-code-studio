import type { Program } from "./types.js";

export const sheepCityStarterProgram: Program = {
  schemaVersion: 2,
  programId: "sheep-city-starter",
  projectId: "sheep-city",
  scripts: [
    {
      id: "script-player",
      nodeType: "script",
      scriptKind: "player",
      displayName: "Player",
      body: [
        { id: "event-projectile-hit", nodeType: "projectile_hit_event", body: [] },
        { id: "event-player-move", nodeType: "player_move_event", body: [] },
      ],
    },
    { id: "script-game", nodeType: "script", scriptKind: "game", displayName: "Game", body: [] },
    {
      id: "script-sheep",
      nodeType: "script",
      scriptKind: "sheep",
      displayName: "Sheep",
      body: [
        { id: "event-sheep-spawn", nodeType: "sheep_spawn_event", body: [] },
        { id: "event-sheep-death", nodeType: "sheep_death_event", body: [] },
      ],
    },
  ],
};

export const sheepCityCompletedExample: Program = {
  schemaVersion: 2,
  programId: "sheep-city-complete",
  projectId: "sheep-city",
  scripts: [
    {
      id: "script-player",
      nodeType: "script",
      scriptKind: "player",
      displayName: "Player",
      body: [
        {
          id: "event-projectile-hit",
          nodeType: "projectile_hit_event",
          body: [{ id: "explode-safe", nodeType: "explode_at_hit", power: 2 }],
        },
        {
          id: "event-player-move",
          nodeType: "player_move_event",
          body: [
            {
              id: "if-gold",
              nodeType: "if_then",
              condition: {
                id: "equals-gold",
                nodeType: "equals",
                left: {
                  id: "material-under-player",
                  nodeType: "get_material_under_player",
                },
                right: {
                  id: "gold-block-value",
                  nodeType: "material_literal",
                  material: "GOLD_BLOCK",
                },
              },
              then: [{ id: "bounce-gold", nodeType: "bounce_player", verticalVelocity: 1.2 }],
            },
          ],
        },
      ],
    },
    { id: "script-game", nodeType: "script", scriptKind: "game", displayName: "Game", body: [] },
    {
      id: "script-sheep",
      nodeType: "script",
      scriptKind: "sheep",
      displayName: "Sheep",
      body: [
        {
          id: "event-sheep-spawn",
          nodeType: "sheep_spawn_event",
          body: [
            { id: "sheep-red", nodeType: "set_sheep_color", color: "RED" },
            { id: "sheep-fast", nodeType: "set_sheep_speed", multiplier: 1.8 },
          ],
        },
        {
          id: "event-sheep-death",
          nodeType: "sheep_death_event",
          body: [{ id: "drop-gold", nodeType: "drop_item", item: "GOLD_INGOT", quantity: 1 }],
        },
      ],
    },
  ],
};
