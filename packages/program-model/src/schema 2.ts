import { z } from "zod";
import type { EventNode, LegacyProgramV0, ProgramV1, ScriptNode, StatementNode } from "./types.js";

const nodeId = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]{2,63}$/,
    "Use a stable lowercase node ID with letters, numbers, or dashes.",
  );

const base = {
  id: nodeId,
};

export const ExplodeAtHitSchema = z.strictObject({
  ...base,
  nodeType: z.literal("explode_at_hit"),
  power: z.number().finite(),
});

export const BouncePlayerSchema = z.strictObject({
  ...base,
  nodeType: z.literal("bounce_player"),
  verticalVelocity: z.number().finite(),
});

export const SetSheepColorSchema = z.strictObject({
  ...base,
  nodeType: z.literal("set_sheep_color"),
  color: z.literal("RED"),
});

export const SetSheepSpeedSchema = z.strictObject({
  ...base,
  nodeType: z.literal("set_sheep_speed"),
  multiplier: z.number().finite(),
});

export const DropItemSchema = z.strictObject({
  ...base,
  nodeType: z.literal("drop_item"),
  item: z.literal("GOLD_INGOT"),
  quantity: z.number().int(),
});

export const StatementSchema: z.ZodType<StatementNode> = z.lazy(() =>
  z.discriminatedUnion("nodeType", [
    ExplodeAtHitSchema,
    BouncePlayerSchema,
    z.strictObject({
      ...base,
      nodeType: z.literal("if_on_material"),
      material: z.literal("GOLD_BLOCK"),
      then: z.array(StatementSchema),
    }),
    SetSheepColorSchema,
    SetSheepSpeedSchema,
    DropItemSchema,
  ]),
);

export const EventSchema: z.ZodType<EventNode> = z.strictObject({
  ...base,
  nodeType: z.enum([
    "projectile_hit_event",
    "player_move_event",
    "sheep_spawn_event",
    "sheep_death_event",
  ]),
  body: z.array(StatementSchema),
});

export const ScriptSchema: z.ZodType<ScriptNode> = z.strictObject({
  ...base,
  nodeType: z.literal("script"),
  scriptKind: z.enum(["player", "game", "sheep"]),
  displayName: z.enum(["Player", "Game", "Sheep"]),
  body: z.array(EventSchema),
});

export const ProgramV1Schema: z.ZodType<ProgramV1> = z.strictObject({
  schemaVersion: z.literal(1),
  programId: nodeId,
  projectId: z.literal("sheep-city"),
  scripts: z.array(ScriptSchema),
});

export const LegacyProgramV0Schema: z.ZodType<LegacyProgramV0> = z.strictObject({
  schemaVersion: z.literal(0),
  id: nodeId,
  project: z.literal("sheep-city"),
  areas: z.strictObject({
    Player: z.array(EventSchema).optional(),
    Game: z.array(EventSchema).optional(),
    Sheep: z.array(EventSchema).optional(),
  }),
});
