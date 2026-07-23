import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const BenchmarkSchema = z.strictObject({
  id: slug,
  mode: z.enum(["automatic", "structural", "runtime", "manual"]),
});

export const ProjectSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: slug,
  title: z.string().min(1),
  day: z.number().int().positive(),
  status: z.enum(["vertical-slice-target", "source-verification-required", "draft", "published"]),
  sourceProvenance: z.string().min(1),
  scripts: z.array(z.enum(["player", "game", "sheep-entity"])).min(1),
  mechanics: z.array(z.string().min(1)),
  benchmarks: z.array(BenchmarkSchema),
  worldTemplate: slug,
});

export const TrackSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: slug,
  title: z.string().min(1),
  status: z.literal("source-verification-required"),
  projects: z.array(slug).min(1),
  notes: z.array(z.string().min(1)).optional(),
});

export const WorldTemplateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: slug,
  status: z.enum(["asset-required", "draft", "validated"]),
  minecraftVersion: z.string().min(1),
  spawn: z.union([
    z.literal("pending"),
    z.strictObject({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      yaw: z.number(),
      pitch: z.number(),
    }),
  ]),
  worldBorder: z.union([
    z.literal("pending"),
    z.strictObject({ centerX: z.number(), centerZ: z.number(), diameter: z.number().positive() }),
  ]),
  preGenerated: z.boolean(),
  resetPolicy: z.literal("restore-from-immutable-template"),
});

export type CurriculumProject = z.infer<typeof ProjectSchema>;
export type CurriculumTrack = z.infer<typeof TrackSchema>;
export type WorldTemplate = z.infer<typeof WorldTemplateSchema>;
