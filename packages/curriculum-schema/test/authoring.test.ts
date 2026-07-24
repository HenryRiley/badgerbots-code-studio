import { sheepCityStarterProgram } from "@badgerbots/program-model";
import { describe, expect, it } from "vitest";
import {
  CurriculumAuthoringError,
  CurriculumAuthoringService,
  CurriculumDocumentSchema,
  publicationBlockers,
  type CurriculumActor,
  type CurriculumDocument,
} from "../src/index.js";

const owner: CurriculumActor = { id: "instructor-owner", role: "owner" };
const assistant: CurriculumActor = { id: "instructor-assistant", role: "assistant" };
const context = {
  correlationId: "correlation-one",
  occurredAt: "2026-07-24T12:00:00.000Z",
};

function document(options?: {
  verified?: boolean;
  state?: CurriculumDocument["state"];
}): CurriculumDocument {
  const verified = options?.verified ?? false;
  return CurriculumDocumentSchema.parse({
    schemaVersion: 1,
    id: "grades-three-four",
    trackId: "grades-three-four",
    title: "Grades 3-4",
    revision: 1,
    state: options?.state ?? "draft",
    content: {
      toolboxPolicy: "complete-searchable-library",
      sources: [
        verified
          ? {
              id: "source-sheep-city",
              kind: "badgerbots-owned",
              locator: "curriculum/source-material/owned.pdf#slide=1",
              status: "verified",
              ownershipEvidence: "Ownership reviewed by BadgerBots.",
              verifiedBy: "instructor-owner",
              verifiedAt: "2026-07-24T11:00:00.000Z",
            }
          : {
              id: "source-sheep-city",
              kind: "badgerbots-owned",
              locator: "curriculum/source-material/pending.pdf",
              status: "pending",
            },
      ],
      assets: [],
      projects: [
        {
          id: "sheep-city",
          title: "Sheep City",
          day: 1,
          worldTemplate: verified
            ? {
                id: "sheep-city-world",
                version: 1,
                status: "validated",
                sha256: "a".repeat(64),
              }
            : { id: "sheep-city-world", version: 1, status: "asset-required" },
          chapters: [
            {
              id: "chapter-one",
              title: "Source-authored chapter",
              steps: [
                {
                  id: "step-one",
                  title: "Source-authored step",
                  studentDirections: "Fixture directions written only for this automated test.",
                  instructorDirections:
                    "Fixture instructor notes written only for this automated test.",
                  sourceIds: ["source-sheep-city"],
                  assetIds: [],
                  instructionalBlockGroups: [
                    {
                      id: "suggested-events",
                      title: "Suggested events",
                      suggestedBlockIds: ["projectile-hit-event"],
                    },
                  ],
                  starterProgram: sheepCityStarterProgram,
                  benchmarks: [
                    {
                      id: "contains-event",
                      mode: "structural",
                      match: "contains-any",
                      nodeTypes: ["projectile-hit-event", "player-move-event"],
                    },
                    {
                      id: "instructor-check",
                      mode: "manual",
                      instructorPrompt: "Accept any safe working alternative.",
                    },
                  ],
                  optionalExtension: false,
                },
              ],
            },
          ],
        },
      ],
    },
  });
}

describe("curriculum authoring lifecycle", () => {
  it("saves immutable revisions with optimistic conflict handling", () => {
    const service = new CurriculumAuthoringService();
    const created = service.create({ document: document(), actor: owner, ...context });
    const content = structuredClone(created.content);
    content.projects[0]!.title = "Updated title";
    const saved = service.save({
      documentId: created.id,
      baseRevision: 1,
      content,
      actor: assistant,
      ...context,
    });
    expect(saved.revision).toBe(2);
    expect(service.history(created.id, owner).map((item) => item.revision)).toEqual([1, 2]);
    expect(() =>
      service.save({
        documentId: created.id,
        baseRevision: 1,
        content,
        actor: owner,
        ...context,
      }),
    ).toThrowError(expect.objectContaining({ code: "revision_conflict" }));
  });

  it("previews pending work but blocks publication without verified sources and world", () => {
    const service = new CurriculumAuthoringService();
    const created = service.create({ document: document(), actor: owner, ...context });
    const preview = service.preview(created.id, assistant);
    expect(preview.publicationBlockers).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/unverified source/),
        expect.stringMatching(/world/i),
      ]),
    );
    const review = service.submitForReview({
      documentId: created.id,
      baseRevision: 1,
      actor: assistant,
      ...context,
    });
    expect(() =>
      service.publish({
        documentId: review.id,
        baseRevision: review.revision,
        actor: owner,
        ...context,
      }),
    ).toThrowError(expect.objectContaining({ code: "publication_blocked" }));
  });

  it("allows only an owner to publish a fully verified reviewed revision", () => {
    const service = new CurriculumAuthoringService();
    const created = service.create({
      document: document({ verified: true }),
      actor: owner,
      ...context,
    });
    const review = service.submitForReview({
      documentId: created.id,
      baseRevision: created.revision,
      actor: assistant,
      ...context,
    });
    expect(() =>
      service.publish({
        documentId: review.id,
        baseRevision: review.revision,
        actor: assistant,
        ...context,
      }),
    ).toThrowError(expect.objectContaining({ code: "permission_denied" }));
    const published = service.publish({
      documentId: review.id,
      baseRevision: review.revision,
      actor: owner,
      ...context,
    });
    expect(published).toMatchObject({ state: "published", revision: 3 });
    expect(publicationBlockers(published)).toEqual([]);
    expect(() =>
      service.save({
        documentId: published.id,
        baseRevision: published.revision,
        content: published.content,
        actor: owner,
        ...context,
      }),
    ).toThrowError(expect.objectContaining({ code: "state_conflict" }));
  });

  it("duplicates a snapshot into a new draft without changing its source", () => {
    const service = new CurriculumAuthoringService();
    const created = service.create({
      document: document({ verified: true }),
      actor: owner,
      ...context,
    });
    const duplicate = service.duplicate({
      documentId: created.id,
      newDocumentId: "grades-three-four-copy",
      newTitle: "Grades 3-4 copy",
      actor: assistant,
      ...context,
    });
    expect(duplicate).toMatchObject({
      id: "grades-three-four-copy",
      revision: 1,
      state: "draft",
      origin: { documentId: created.id, revision: 1 },
    });
    expect(duplicate.content).toEqual(created.content);
  });

  it("uses suggestions and tolerant benchmarks without a block allowlist or exact layout", () => {
    const parsed = document({ verified: true });
    const serialized = JSON.stringify(parsed);
    expect(parsed.content.toolboxPolicy).toBe("complete-searchable-library");
    expect(serialized).not.toContain("allowedBlockIds");
    expect(serialized).not.toContain("expectedSerializedProgram");
    expect(parsed.content.projects[0]?.chapters[0]?.steps[0]?.benchmarks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: "structural", match: "contains-any" }),
        expect.objectContaining({ mode: "manual" }),
      ]),
    );
    expect(() =>
      CurriculumDocumentSchema.parse({
        ...parsed,
        content: { ...parsed.content, allowedBlockIds: ["projectile-hit-event"] },
      }),
    ).toThrow();
  });

  it("rejects an invalid starter program before it can be saved", () => {
    const invalid = document();
    invalid.content.projects[0]!.chapters[0]!.steps[0]!.starterProgram = {
      schemaVersion: 2,
      projectId: "sheep-city",
    };
    expect(() =>
      new CurriculumAuthoringService().create({
        document: invalid,
        actor: owner,
        ...context,
      }),
    ).toThrowError(CurriculumAuthoringError);
  });

  it("blocks a referenced asset until its source, license, and checksum are verified", () => {
    const pendingAsset = document({ verified: true });
    pendingAsset.content.assets.push({
      id: "asset-step-image",
      kind: "image",
      sourceId: "source-sheep-city",
      status: "pending",
    });
    pendingAsset.content.projects[0]!.chapters[0]!.steps[0]!.assetIds.push("asset-step-image");
    expect(publicationBlockers(pendingAsset)).toContain(
      "Step step-one has an unverified asset asset-step-image.",
    );
  });

  it("rejects duplicate stable identifiers anywhere in one document", () => {
    const duplicate = document();
    duplicate.content.projects[0]!.chapters[0]!.steps[0]!.benchmarks[0]!.id = "step-one";
    expect(() =>
      new CurriculumAuthoringService().create({
        document: duplicate,
        actor: owner,
        ...context,
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_content" }));
  });

  it("returns a friendly domain error for an empty required direction", () => {
    const service = new CurriculumAuthoringService();
    const created = service.create({ document: document(), actor: owner, ...context });
    const content = structuredClone(created.content);
    content.projects[0]!.chapters[0]!.steps[0]!.studentDirections = "";
    const saveInvalidContent = () =>
      service.save({
        documentId: created.id,
        baseRevision: created.revision,
        content,
        actor: assistant,
        ...context,
      });
    expect(saveInvalidContent).toThrowError(expect.objectContaining({ code: "invalid_content" }));
    expect(saveInvalidContent).toThrowError(/studentDirections/);
  });
});
