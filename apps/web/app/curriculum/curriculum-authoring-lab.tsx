"use client";

import {
  CurriculumAuthoringError,
  CurriculumAuthoringService,
  type CurriculumContent,
  type CurriculumDocument,
} from "@badgerbots/curriculum-schema";
import { sheepCityStarterProgram } from "@badgerbots/program-model";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

const owner = { id: "local-owner", role: "owner" } as const;

function pendingDraft(): CurriculumDocument {
  return {
    schemaVersion: 1,
    id: "grades-three-four-local",
    trackId: "grades-three-four",
    title: "Grades 3-4 local draft",
    revision: 1,
    state: "draft",
    content: {
      toolboxPolicy: "complete-searchable-library",
      sources: [
        {
          id: "source-slides",
          kind: "badgerbots-owned",
          locator: "curriculum/source-material/pending-owner-intake.pdf",
          status: "pending",
        },
      ],
      assets: [],
      projects: [
        {
          id: "sheep-city",
          title: "Sheep City",
          day: 1,
          worldTemplate: {
            id: "sheep-city-world",
            version: 1,
            status: "asset-required",
          },
          chapters: [
            {
              id: "chapter-source-pending",
              title: "Source verification required",
              steps: [
                {
                  id: "step-source-pending",
                  title: "Unpublished planning step",
                  studentDirections: "Source-verified student directions have not been supplied.",
                  instructorDirections:
                    "Add only BadgerBots-owned, licensed, or original directions after provenance review.",
                  sourceIds: ["source-slides"],
                  assetIds: [],
                  instructionalBlockGroups: [
                    {
                      id: "suggested-events",
                      title: "Suggested event blocks",
                      suggestedBlockIds: ["projectile-hit-event", "player-move-event"],
                    },
                  ],
                  starterProgram: sheepCityStarterProgram,
                  benchmarks: [
                    {
                      id: "manual-source-check",
                      mode: "manual",
                      instructorPrompt:
                        "Do not mark curriculum complete until its owned source is verified.",
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
  };
}

function eventContext(sequence: number) {
  return {
    correlationId: `local-event-${sequence}`,
    occurredAt: new Date().toISOString(),
  };
}

export function CurriculumAuthoringLab() {
  const initial = useMemo(() => {
    const service = new CurriculumAuthoringService();
    const document = service.create({
      document: pendingDraft(),
      actor: owner,
      ...eventContext(1),
    });
    return { service, document };
  }, []);
  const [document, setDocument] = useState(initial.document);
  const [studentDirections, setStudentDirections] = useState(
    document.content.projects[0]?.chapters[0]?.steps[0]?.studentDirections ?? "",
  );
  const [message, setMessage] = useState(
    "Local draft ready. Nothing on this page is published or sent to a database.",
  );
  const [previewOpen, setPreviewOpen] = useState(true);
  const sequence = useRef(2);
  const duplicateSequence = useRef(1);

  const preview = initial.service.preview(document.id, owner);
  const history = initial.service.history(document.id, owner);

  function run(action: () => CurriculumDocument, success: (next: CurriculumDocument) => string) {
    try {
      const next = action();
      setDocument(next);
      setMessage(success(next));
    } catch (error) {
      setMessage(
        error instanceof CurriculumAuthoringError
          ? error.message
          : "The local curriculum action failed safely.",
      );
    }
  }

  function saveDraft() {
    const content: CurriculumContent = structuredClone(document.content);
    const step = content.projects[0]?.chapters[0]?.steps[0];
    if (!step) {
      setMessage("The source-gated Sheep City planning step is missing.");
      return;
    }
    step.studentDirections = studentDirections;
    run(
      () =>
        initial.service.save({
          documentId: document.id,
          baseRevision: document.revision,
          content,
          actor: owner,
          ...eventContext(sequence.current++),
        }),
      (next) => `Draft revision ${next.revision} saved locally.`,
    );
  }

  function submitForReview() {
    run(
      () =>
        initial.service.submitForReview({
          documentId: document.id,
          baseRevision: document.revision,
          actor: owner,
          ...eventContext(sequence.current++),
        }),
      (next) => `Revision ${next.revision} is ready for local review.`,
    );
  }

  function reopenDraft() {
    run(
      () =>
        initial.service.reopen({
          documentId: document.id,
          baseRevision: document.revision,
          actor: owner,
          ...eventContext(sequence.current++),
        }),
      (next) => `Revision ${next.revision} reopened as a draft.`,
    );
  }

  function tryPublish() {
    run(
      () =>
        initial.service.publish({
          documentId: document.id,
          baseRevision: document.revision,
          actor: owner,
          ...eventContext(sequence.current++),
        }),
      (next) => `Revision ${next.revision} published.`,
    );
  }

  function duplicateDraft() {
    const copyNumber = duplicateSequence.current++;
    run(
      () =>
        initial.service.duplicate({
          documentId: document.id,
          newDocumentId: `grades-three-four-copy-${copyNumber}`,
          newTitle: `Grades 3-4 copy ${copyNumber}`,
          actor: owner,
          ...eventContext(sequence.current++),
        }),
      (next) => {
        setStudentDirections(
          next.content.projects[0]?.chapters[0]?.steps[0]?.studentDirections ?? "",
        );
        return `Created ${next.title} as an independent local draft.`;
      },
    );
  }

  return (
    <main className="studio-shell curriculum-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            BB
          </span>
          <div>
            <p className="eyebrow">BadgerBots Code Studio</p>
            <h1>Curriculum authoring lab</h1>
          </div>
        </div>
        <div className="header-actions">
          <Link className="header-link" href="/">
            Block editor
          </Link>
          <div className="proof-badge">
            <span aria-hidden="true" />
            Checkpoint 8 · local only
          </div>
        </div>
      </header>

      <section className="notice" aria-label="Authoring limitation">
        <strong>Source-gated preview:</strong> this lab stores state in memory only. It cannot
        publish while the BadgerBots source PDF and original world remain unverified.
      </section>

      <section className="curriculum-summary" aria-label="Curriculum status">
        <article>
          <span>Lifecycle</span>
          <strong>{document.state}</strong>
        </article>
        <article>
          <span>Revision</span>
          <strong>{document.revision}</strong>
        </article>
        <article>
          <span>Saved snapshots</span>
          <strong>{history.length}</strong>
        </article>
        <article>
          <span>Toolbox policy</span>
          <strong>Full library</strong>
        </article>
      </section>

      <section className="curriculum-grid">
        <article className="authoring-card">
          <div>
            <p className="eyebrow">Sheep City · planning step</p>
            <h2>Student directions</h2>
            <p className="field-help">
              Use original or verified BadgerBots wording only. Suggested blocks never restrict the
              searchable toolbox.
            </p>
          </div>
          <label htmlFor="student-directions">Draft directions</label>
          <textarea
            id="student-directions"
            rows={8}
            value={studentDirections}
            disabled={document.state !== "draft"}
            onChange={(event) => setStudentDirections(event.target.value)}
          />
          <div className="curriculum-actions">
            <button
              className="primary"
              type="button"
              disabled={document.state !== "draft"}
              onClick={saveDraft}
            >
              Save revision
            </button>
            {document.state === "draft" ? (
              <button className="quiet" type="button" onClick={submitForReview}>
                Submit for review
              </button>
            ) : null}
            {document.state === "in-review" ? (
              <>
                <button className="quiet" type="button" onClick={reopenDraft}>
                  Reopen draft
                </button>
                <button className="primary" type="button" onClick={tryPublish}>
                  Check and publish
                </button>
              </>
            ) : null}
            <button className="quiet" type="button" onClick={duplicateDraft}>
              Duplicate
            </button>
          </div>
          <p className="authoring-message" role="status">
            {message}
          </p>
        </article>

        <aside className="authoring-card preview-card">
          <div className="preview-heading">
            <div>
              <p className="eyebrow">Publication preview</p>
              <h2>Release safeguards</h2>
            </div>
            <button className="quiet" type="button" onClick={() => setPreviewOpen(!previewOpen)}>
              {previewOpen ? "Hide" : "Show"}
            </button>
          </div>
          {previewOpen ? (
            <>
              <dl className="preview-facts">
                <div>
                  <dt>Track</dt>
                  <dd>{document.title}</dd>
                </div>
                <div>
                  <dt>Project</dt>
                  <dd>{document.content.projects[0]?.title}</dd>
                </div>
                <div>
                  <dt>Suggested blocks</dt>
                  <dd>
                    {document.content.projects[0]?.chapters[0]?.steps[0]?.instructionalBlockGroups[0]?.suggestedBlockIds.join(
                      ", ",
                    )}
                  </dd>
                </div>
              </dl>
              <h3>Publication blockers</h3>
              {preview.publicationBlockers.length > 0 ? (
                <ul className="blocker-list">
                  {preview.publicationBlockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : (
                <p className="ready-message">All local publication checks passed.</p>
              )}
            </>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
