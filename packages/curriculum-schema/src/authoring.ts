import { validateProgram } from "@badgerbots/program-model";
import { z } from "zod";

const opaqueId = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const nonEmptyText = z.string().trim().min(1).max(10_000);

const PendingSourceSchema = z.strictObject({
  id: opaqueId,
  kind: z.enum(["badgerbots-owned", "licensed-third-party", "original-new"]),
  locator: z.string().trim().min(1).max(500),
  status: z.literal("pending"),
});

const VerifiedSourceSchema = z.strictObject({
  id: opaqueId,
  kind: z.enum(["badgerbots-owned", "licensed-third-party", "original-new"]),
  locator: z.string().trim().min(1).max(500),
  status: z.literal("verified"),
  ownershipEvidence: z.string().trim().min(1).max(1_000),
  verifiedBy: opaqueId,
  verifiedAt: z.string().datetime(),
});

const RejectedSourceSchema = z.strictObject({
  id: opaqueId,
  kind: z.enum(["badgerbots-owned", "licensed-third-party", "original-new"]),
  locator: z.string().trim().min(1).max(500),
  status: z.literal("rejected"),
  reason: z.string().trim().min(1).max(1_000),
});

export const CurriculumSourceSchema = z.discriminatedUnion("status", [
  PendingSourceSchema,
  VerifiedSourceSchema,
  RejectedSourceSchema,
]);

const PendingAssetSchema = z.strictObject({
  id: opaqueId,
  kind: z.enum(["image", "world", "starter-workspace", "download"]),
  sourceId: opaqueId,
  status: z.literal("pending"),
});

const VerifiedAssetSchema = z.strictObject({
  id: opaqueId,
  kind: z.enum(["image", "world", "starter-workspace", "download"]),
  sourceId: opaqueId,
  status: z.literal("verified"),
  sha256,
  license: z.string().trim().min(1).max(500),
  verifiedBy: opaqueId,
  verifiedAt: z.string().datetime(),
});

const RejectedAssetSchema = z.strictObject({
  id: opaqueId,
  kind: z.enum(["image", "world", "starter-workspace", "download"]),
  sourceId: opaqueId,
  status: z.literal("rejected"),
  reason: z.string().trim().min(1).max(1_000),
});

export const CurriculumAssetSchema = z.discriminatedUnion("status", [
  PendingAssetSchema,
  VerifiedAssetSchema,
  RejectedAssetSchema,
]);

export const FlexibleBenchmarkSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    id: opaqueId,
    mode: z.literal("structural"),
    match: z.enum(["contains-all", "contains-any"]),
    nodeTypes: z.array(opaqueId).min(1).max(32),
  }),
  z.strictObject({
    id: opaqueId,
    mode: z.literal("runtime"),
    observation: opaqueId,
    minimumCount: z.number().int().positive().max(10_000).optional(),
  }),
  z.strictObject({
    id: opaqueId,
    mode: z.literal("manual"),
    instructorPrompt: nonEmptyText,
  }),
]);

export const InstructionalBlockGroupSchema = z.strictObject({
  id: opaqueId,
  title: z.string().trim().min(1).max(160),
  suggestedBlockIds: z.array(opaqueId).max(64),
});

export const CurriculumStepSchema = z.strictObject({
  id: opaqueId,
  title: z.string().trim().min(1).max(160),
  studentDirections: nonEmptyText,
  instructorDirections: nonEmptyText,
  sourceIds: z.array(opaqueId).min(1).max(32),
  assetIds: z.array(opaqueId).max(32),
  instructionalBlockGroups: z.array(InstructionalBlockGroupSchema).max(16),
  starterProgram: z.unknown().optional(),
  benchmarks: z.array(FlexibleBenchmarkSchema).min(1).max(32),
  optionalExtension: z.boolean(),
});

export const CurriculumChapterSchema = z.strictObject({
  id: opaqueId,
  title: z.string().trim().min(1).max(160),
  steps: z.array(CurriculumStepSchema).min(1).max(64),
});

const PendingWorldTemplateSchema = z.strictObject({
  id: opaqueId,
  version: z.number().int().positive(),
  status: z.enum(["asset-required", "draft"]),
});

const ValidatedWorldTemplateSchema = z.strictObject({
  id: opaqueId,
  version: z.number().int().positive(),
  status: z.literal("validated"),
  sha256,
});

export const CurriculumProjectAuthoringSchema = z.strictObject({
  id: opaqueId,
  title: z.string().trim().min(1).max(160),
  day: z.number().int().positive().max(100),
  worldTemplate: z.union([PendingWorldTemplateSchema, ValidatedWorldTemplateSchema]),
  chapters: z.array(CurriculumChapterSchema).min(1).max(32),
});

export const CurriculumContentSchema = z.strictObject({
  toolboxPolicy: z.literal("complete-searchable-library"),
  sources: z.array(CurriculumSourceSchema).min(1).max(500),
  assets: z.array(CurriculumAssetSchema).max(500),
  projects: z.array(CurriculumProjectAuthoringSchema).min(1).max(100),
});

export const CurriculumDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: opaqueId,
  trackId: opaqueId,
  title: z.string().trim().min(1).max(160),
  revision: z.number().int().positive(),
  state: z.enum(["draft", "in-review", "published", "retired"]),
  origin: z
    .strictObject({
      documentId: opaqueId,
      revision: z.number().int().positive(),
    })
    .optional(),
  content: CurriculumContentSchema,
});

export type CurriculumContent = z.infer<typeof CurriculumContentSchema>;
export type CurriculumDocument = z.infer<typeof CurriculumDocumentSchema>;

export interface CurriculumActor {
  id: string;
  role: "owner" | "assistant";
}

export interface CurriculumAuditEvent {
  documentId: string;
  revision: number;
  actorId: string;
  action: "created" | "saved" | "submitted" | "reopened" | "published" | "duplicated";
  correlationId: string;
  occurredAt: string;
}

export interface CurriculumPreview {
  document: CurriculumDocument;
  publicationBlockers: string[];
}

export class CurriculumAuthoringError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "revision_conflict"
      | "state_conflict"
      | "permission_denied"
      | "publication_blocked"
      | "invalid_content",
    message: string,
  ) {
    super(message);
    this.name = "CurriculumAuthoringError";
  }
}

export class CurriculumAuthoringService {
  private readonly documents = new Map<string, CurriculumDocument>();
  private readonly revisions = new Map<string, CurriculumDocument[]>();
  private readonly auditEvents: CurriculumAuditEvent[] = [];

  create(input: {
    document: CurriculumDocument;
    actor: CurriculumActor;
    correlationId: string;
    occurredAt: string;
  }): CurriculumDocument {
    requireActor(input.actor);
    requireEventContext(input.correlationId, input.occurredAt);
    const document = parseDocument(input.document);
    if (document.revision !== 1 || document.state !== "draft")
      throw new CurriculumAuthoringError(
        "state_conflict",
        "A curriculum document must begin as draft revision 1.",
      );
    if (this.documents.has(document.id))
      throw new CurriculumAuthoringError("state_conflict", "This curriculum ID already exists.");
    this.store(document);
    this.audit(document, input.actor, "created", input.correlationId, input.occurredAt);
    return clone(document);
  }

  save(input: {
    documentId: string;
    baseRevision: number;
    content: CurriculumContent;
    actor: CurriculumActor;
    correlationId: string;
    occurredAt: string;
  }): CurriculumDocument {
    requireActor(input.actor);
    requireEventContext(input.correlationId, input.occurredAt);
    const current = this.requireDocument(input.documentId);
    if (current.state !== "draft")
      throw new CurriculumAuthoringError(
        "state_conflict",
        "Only a draft curriculum can be edited. Reopen it before making changes.",
      );
    if (current.revision !== input.baseRevision)
      throw new CurriculumAuthoringError(
        "revision_conflict",
        `This curriculum changed from revision ${input.baseRevision} to ${current.revision}. Refresh before saving.`,
      );
    const content = parseContent(input.content);
    validatePrograms(content);
    const next = { ...current, revision: current.revision + 1, content };
    this.store(next);
    this.audit(next, input.actor, "saved", input.correlationId, input.occurredAt);
    return clone(next);
  }

  preview(documentId: string, actor: CurriculumActor): CurriculumPreview {
    requireActor(actor);
    const document = this.requireDocument(documentId);
    return {
      document: clone(document),
      publicationBlockers: publicationBlockers(document),
    };
  }

  submitForReview(input: {
    documentId: string;
    baseRevision: number;
    actor: CurriculumActor;
    correlationId: string;
    occurredAt: string;
  }): CurriculumDocument {
    return this.transition(input, "draft", "in-review", "submitted");
  }

  reopen(input: {
    documentId: string;
    baseRevision: number;
    actor: CurriculumActor;
    correlationId: string;
    occurredAt: string;
  }): CurriculumDocument {
    return this.transition(input, "in-review", "draft", "reopened");
  }

  publish(input: {
    documentId: string;
    baseRevision: number;
    actor: CurriculumActor;
    correlationId: string;
    occurredAt: string;
  }): CurriculumDocument {
    requireActor(input.actor);
    requireEventContext(input.correlationId, input.occurredAt);
    if (input.actor.role !== "owner")
      throw new CurriculumAuthoringError(
        "permission_denied",
        "Only the curriculum owner may publish a reviewed revision.",
      );
    const current = this.requireRevision(input.documentId, input.baseRevision);
    if (current.state !== "in-review")
      throw new CurriculumAuthoringError(
        "state_conflict",
        "Curriculum must be submitted for review before publication.",
      );
    const blockers = publicationBlockers(current);
    if (blockers.length > 0)
      throw new CurriculumAuthoringError(
        "publication_blocked",
        `Curriculum cannot be published: ${blockers.join(" ")}`,
      );
    const next: CurriculumDocument = {
      ...current,
      revision: current.revision + 1,
      state: "published",
    };
    this.store(next);
    this.audit(next, input.actor, "published", input.correlationId, input.occurredAt);
    return clone(next);
  }

  duplicate(input: {
    documentId: string;
    newDocumentId: string;
    newTitle: string;
    actor: CurriculumActor;
    correlationId: string;
    occurredAt: string;
  }): CurriculumDocument {
    requireActor(input.actor);
    requireEventContext(input.correlationId, input.occurredAt);
    if (this.documents.has(input.newDocumentId))
      throw new CurriculumAuthoringError("state_conflict", "The duplicate ID already exists.");
    const source = this.requireDocument(input.documentId);
    const duplicate = parseDocument({
      ...source,
      id: input.newDocumentId,
      title: input.newTitle,
      revision: 1,
      state: "draft",
      origin: { documentId: source.id, revision: source.revision },
    });
    this.store(duplicate);
    this.audit(duplicate, input.actor, "duplicated", input.correlationId, input.occurredAt);
    return clone(duplicate);
  }

  history(documentId: string, actor: CurriculumActor): CurriculumDocument[] {
    requireActor(actor);
    if (!this.documents.has(documentId))
      throw new CurriculumAuthoringError("not_found", "Curriculum document was not found.");
    return clone(this.revisions.get(documentId) ?? []);
  }

  audits(actor: CurriculumActor): CurriculumAuditEvent[] {
    requireActor(actor);
    return clone(this.auditEvents);
  }

  private transition(
    input: {
      documentId: string;
      baseRevision: number;
      actor: CurriculumActor;
      correlationId: string;
      occurredAt: string;
    },
    from: CurriculumDocument["state"],
    to: CurriculumDocument["state"],
    action: CurriculumAuditEvent["action"],
  ): CurriculumDocument {
    requireActor(input.actor);
    requireEventContext(input.correlationId, input.occurredAt);
    const current = this.requireRevision(input.documentId, input.baseRevision);
    if (current.state !== from)
      throw new CurriculumAuthoringError(
        "state_conflict",
        `Curriculum must be ${from} before it can move to ${to}.`,
      );
    const next: CurriculumDocument = {
      ...current,
      revision: current.revision + 1,
      state: to,
    };
    this.store(next);
    this.audit(next, input.actor, action, input.correlationId, input.occurredAt);
    return clone(next);
  }

  private requireRevision(documentId: string, baseRevision: number): CurriculumDocument {
    const current = this.requireDocument(documentId);
    if (current.revision !== baseRevision)
      throw new CurriculumAuthoringError(
        "revision_conflict",
        `This curriculum changed from revision ${baseRevision} to ${current.revision}. Refresh before continuing.`,
      );
    return current;
  }

  private requireDocument(documentId: string): CurriculumDocument {
    const document = this.documents.get(documentId);
    if (!document)
      throw new CurriculumAuthoringError("not_found", "Curriculum document was not found.");
    return document;
  }

  private store(document: CurriculumDocument): void {
    const stored = clone(document);
    this.documents.set(stored.id, stored);
    this.revisions.set(stored.id, [...(this.revisions.get(stored.id) ?? []), stored]);
  }

  private audit(
    document: CurriculumDocument,
    actor: CurriculumActor,
    action: CurriculumAuditEvent["action"],
    correlationId: string,
    occurredAt: string,
  ): void {
    this.auditEvents.push({
      documentId: document.id,
      revision: document.revision,
      actorId: actor.id,
      action,
      correlationId,
      occurredAt,
    });
  }
}

export function publicationBlockers(documentInput: CurriculumDocument): string[] {
  const document = parseDocument(documentInput);
  const sourceById = new Map(document.content.sources.map((source) => [source.id, source]));
  const assetById = new Map(document.content.assets.map((asset) => [asset.id, asset]));
  const blockers = new Set<string>();
  for (const project of document.content.projects) {
    if (project.worldTemplate.status !== "validated")
      blockers.add(`World template ${project.worldTemplate.id} is not validated.`);
    for (const chapter of project.chapters)
      for (const step of chapter.steps) {
        for (const sourceId of step.sourceIds) {
          const source = sourceById.get(sourceId);
          if (!source || source.status !== "verified")
            blockers.add(`Step ${step.id} has an unverified source ${sourceId}.`);
        }
        for (const assetId of step.assetIds) {
          const asset = assetById.get(assetId);
          const source = asset ? sourceById.get(asset.sourceId) : undefined;
          if (!asset || asset.status !== "verified" || source?.status !== "verified")
            blockers.add(`Step ${step.id} has an unverified asset ${assetId}.`);
        }
        if (step.starterProgram !== undefined) {
          const validation = validateProgram(step.starterProgram);
          for (const diagnostic of validation.diagnostics)
            blockers.add(`Step ${step.id} starter program: ${diagnostic.message}`);
        }
      }
  }
  return [...blockers];
}

function validatePrograms(content: CurriculumContent): void {
  validateContentIdentity(content);
  for (const project of content.projects)
    for (const chapter of project.chapters)
      for (const step of chapter.steps) {
        if (step.starterProgram === undefined) continue;
        const validation = validateProgram(step.starterProgram);
        if (!validation.ok)
          throw new CurriculumAuthoringError(
            "invalid_content",
            `Step ${step.id} has an invalid starter program: ${validation.diagnostics[0]?.message ?? "unknown program error"}`,
          );
      }
}

function validateContentIdentity(content: CurriculumContent): void {
  const identifiers = new Set<string>();
  function register(id: string): void {
    if (identifiers.has(id))
      throw new CurriculumAuthoringError(
        "invalid_content",
        `Curriculum identifier ${id} is duplicated.`,
      );
    identifiers.add(id);
  }
  for (const source of content.sources) register(source.id);
  for (const asset of content.assets) register(asset.id);
  for (const project of content.projects) {
    register(project.id);
    for (const chapter of project.chapters) {
      register(chapter.id);
      for (const step of chapter.steps) {
        register(step.id);
        for (const group of step.instructionalBlockGroups) register(group.id);
        for (const benchmark of step.benchmarks) register(benchmark.id);
      }
    }
  }
}

function parseDocument(input: CurriculumDocument): CurriculumDocument {
  const result = CurriculumDocumentSchema.safeParse(input);
  if (!result.success)
    throw new CurriculumAuthoringError(
      "invalid_content",
      `Curriculum field ${result.error.issues[0]?.path.join(".") || "document"} is invalid: ${
        result.error.issues[0]?.message ?? "unsupported value"
      }`,
    );
  const parsed = result.data;
  validatePrograms(parsed.content);
  return parsed;
}

function parseContent(input: CurriculumContent): CurriculumContent {
  const result = CurriculumContentSchema.safeParse(input);
  if (!result.success)
    throw new CurriculumAuthoringError(
      "invalid_content",
      `Curriculum field ${result.error.issues[0]?.path.join(".") || "content"} is invalid: ${
        result.error.issues[0]?.message ?? "unsupported value"
      }`,
    );
  return result.data;
}

function requireActor(actor: CurriculumActor): void {
  if (!opaqueId.safeParse(actor.id).success)
    throw new CurriculumAuthoringError("permission_denied", "Instructor identity is invalid.");
}

function requireEventContext(correlationId: string, occurredAt: string): void {
  if (!opaqueId.safeParse(correlationId).success || !Number.isFinite(Date.parse(occurredAt)))
    throw new CurriculumAuthoringError("invalid_content", "Audit event context is invalid.");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
