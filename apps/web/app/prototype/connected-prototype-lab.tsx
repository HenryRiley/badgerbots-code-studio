"use client";

import { useState } from "react";
import Link from "next/link";
import { sheepCityCompletedExample, type Program } from "@badgerbots/program-model";
import { loadLocalEditorState } from "../local-editor-storage";

const API_BASE = process.env.NEXT_PUBLIC_BADGERBOTS_PROTOTYPE_API ?? "http://127.0.0.1:4180";

interface PrototypeAction {
  id: string;
  event: string;
  sourceNodeId: string;
  description: string;
}

interface DeliveryRecord {
  id: string;
  command: string;
  status: "accepted" | "duplicate" | "rejected";
  detail: string;
}

interface PrototypeSnapshot {
  phase: "session_ready" | "student_joined" | "program_saved" | "program_running" | "stopped";
  sessionId: string;
  workspaceId?: string;
  workspaceRevision: number;
  activeProgramVersionId?: string;
  studentDisplayName?: string;
  worldId?: string;
  actions: PrototypeAction[];
  deliveries: DeliveryRecord[];
}

export function ConnectedPrototypeLab() {
  const [labToken, setLabToken] = useState<string>();
  const [joinCode, setJoinCode] = useState("");
  const [enteredCode, setEnteredCode] = useState("");
  const [firstName, setFirstName] = useState("Alex");
  const [lastInitial, setLastInitial] = useState("B");
  const [snapshot, setSnapshot] = useState<PrototypeSnapshot>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Start both local services, then create a memory-only camp session.",
  );
  const [error, setError] = useState<string>();

  const request = async (
    path: string,
    body?: Record<string, unknown>,
    token = labToken,
  ): Promise<Record<string, unknown>> => {
    const response = await fetch(`${API_BASE}${path}`, {
      method: path === "/api/lab/state" ? "GET" : "POST",
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = (await response.json()) as Record<string, unknown>;
    if (!response.ok)
      throw new Error(
        typeof result.error === "string" ? result.error : "Prototype request failed.",
      );
    return result;
  };

  const perform = async (work: () => Promise<string>) => {
    setBusy(true);
    setError(undefined);
    try {
      setMessage(await work());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Prototype action failed.");
    } finally {
      setBusy(false);
    }
  };

  const updateSnapshot = (result: Record<string, unknown>): PrototypeSnapshot => {
    const next = result.snapshot as PrototypeSnapshot;
    setSnapshot(next);
    return next;
  };

  const startLab = () =>
    perform(async () => {
      const result = await request("/api/lab/bootstrap", undefined, undefined);
      const token = result.labToken as string;
      const code = result.joinCode as string;
      setLabToken(token);
      setJoinCode(code);
      setEnteredCode(code);
      updateSnapshot(result);
      return "A random one-day local session and class code were created.";
    });

  const join = () =>
    perform(async () => {
      const result = await request("/api/lab/join", {
        joinCode: enteredCode,
        firstName,
        lastInitial,
      });
      const next = updateSnapshot(result);
      return `${next.studentDisplayName} joined a private prototype workspace.`;
    });

  const saveProgram = (program: Program, label: string) =>
    perform(async () => {
      if (!snapshot) throw new Error("Create and join a local session first.");
      const result = await request("/api/lab/save", {
        baseRevision: snapshot.workspaceRevision,
        program,
      });
      const next = updateSnapshot(result);
      return `${label} saved as canonical revision ${next.workspaceRevision}.`;
    });

  const syncEditorProgram = () => {
    const restored = loadLocalEditorState(localStorage);
    if (restored.kind !== "loaded") {
      setError(
        restored.kind === "error"
          ? restored.message
          : "No locally saved editor program exists. Use the editor first or load the test program.",
      );
      return;
    }
    void saveProgram(restored.state.program, "The editor's last runnable program");
  };

  const run = () =>
    perform(async () => {
      const next = updateSnapshot(await request("/api/lab/run"));
      return `Host accepted signed deployment ${next.activeProgramVersionId}.`;
    });

  const rejectInvalid = () =>
    perform(async () => {
      const before = snapshot?.activeProgramVersionId;
      const next = updateSnapshot(await request("/api/lab/reject-invalid"));
      if (next.activeProgramVersionId !== before)
        throw new Error("Last known-good runtime changed unexpectedly.");
      return "Host rejected the over-limit replacement and retained the active program.";
    });

  const fireEvent = (
    event: "projectile_hit" | "player_move" | "sheep_spawn" | "sheep_death",
    materialUnderPlayer?: "GOLD_BLOCK" | "OTHER",
  ) =>
    perform(async () => {
      const next = updateSnapshot(
        await request("/api/lab/event", {
          event,
          ...(materialUnderPlayer ? { materialUnderPlayer } : {}),
        }),
      );
      return `${event} executed; ${next.actions.length} attributed action(s) recorded.`;
    });

  const stop = () =>
    perform(async () => {
      updateSnapshot(await request("/api/lab/stop"));
      return "The signed Stop command cancelled the active execution scope.";
    });

  const joined = Boolean(snapshot?.studentDisplayName);
  const saved = (snapshot?.workspaceRevision ?? 0) > 0;
  const running = snapshot?.phase === "program_running";

  return (
    <main className="prototype-shell">
      <header className="prototype-header">
        <div>
          <p className="eyebrow">Checkpoint 9 · connected local prototype</p>
          <h1>Web → control plane → Host → runtime</h1>
          <p>
            A real signed integration path using an in-memory control plane and headless Minecraft
            adapter.
          </p>
        </div>
        <Link className="header-link" href="/">
          Open block editor
        </Link>
      </header>

      <section className="notice" aria-label="Prototype limitation">
        <strong>Still not Paper acceptance:</strong> the Host protocol and atomic runtime are real,
        but Minecraft events are fired through the headless adapter on this Mac. The API binds to
        loopback only and loses all data when stopped.
      </section>

      <section className="prototype-grid">
        <article className="prototype-card">
          <div className="prototype-card-title">
            <span>1</span>
            <div>
              <h2>Create and join</h2>
              <p>Exercises generated class codes and minimal camper identity.</p>
            </div>
          </div>
          <button
            className="primary"
            type="button"
            disabled={busy || Boolean(labToken)}
            onClick={() => void startLab()}
          >
            Create local camp session
          </button>
          {joinCode ? (
            <div className="prototype-code">
              <span>Generated class code</span>
              <strong>{joinCode}</strong>
            </div>
          ) : null}
          <div className="prototype-form">
            <label>
              Class code
              <input value={enteredCode} onChange={(event) => setEnteredCode(event.target.value)} />
            </label>
            <label>
              First name
              <input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </label>
            <label>
              Last initial
              <input
                maxLength={1}
                value={lastInitial}
                onChange={(event) => setLastInitial(event.target.value)}
              />
            </label>
          </div>
          <button
            className="quiet"
            type="button"
            disabled={busy || !labToken || joined}
            onClick={() => void join()}
          >
            Join Sheep City
          </button>
        </article>

        <article className="prototype-card">
          <div className="prototype-card-title">
            <span>2</span>
            <div>
              <h2>Save and deploy</h2>
              <p>Validates the canonical AST and uses optimistic revisions.</p>
            </div>
          </div>
          <div className="prototype-button-stack">
            <button
              type="button"
              className="quiet"
              disabled={busy || !joined}
              onClick={syncEditorProgram}
            >
              Sync last runnable editor program
            </button>
            <button
              type="button"
              className="quiet"
              disabled={busy || !joined}
              onClick={() => void saveProgram(sheepCityCompletedExample, "Completed test program")}
            >
              Save completed Sheep City test program
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || !saved}
              onClick={() => void run()}
            >
              Run through signed Host channel
            </button>
            <button
              type="button"
              className="danger-outline"
              disabled={busy || !running}
              onClick={() => void rejectInvalid()}
            >
              Prove bad deployment keeps last good
            </button>
          </div>
        </article>

        <article className="prototype-card">
          <div className="prototype-card-title">
            <span>3</span>
            <div>
              <h2>Fire scoped events</h2>
              <p>Runs attributed Sheep City instructions under runtime limits.</p>
            </div>
          </div>
          <div className="prototype-event-grid">
            <button disabled={busy || !running} onClick={() => void fireEvent("projectile_hit")}>
              projectileHit()
            </button>
            <button
              disabled={busy || !running}
              onClick={() => void fireEvent("player_move", "GOLD_BLOCK")}
            >
              playerMove(GOLD_BLOCK)
            </button>
            <button disabled={busy || !running} onClick={() => void fireEvent("sheep_spawn")}>
              onSheepSpawn()
            </button>
            <button disabled={busy || !running} onClick={() => void fireEvent("sheep_death")}>
              onSheepDeath()
            </button>
          </div>
          <button
            className="danger-outline"
            type="button"
            disabled={busy || !running}
            onClick={() => void stop()}
          >
            Stop and cancel scope
          </button>
        </article>
      </section>

      <section className="prototype-status" aria-live="polite">
        <div>
          <span>Current result</span>
          <strong className={error ? "error-text" : ""}>{error ?? message}</strong>
        </div>
        <dl>
          <div>
            <dt>Phase</dt>
            <dd>{snapshot?.phase ?? "not started"}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>{snapshot?.workspaceRevision ?? 0}</dd>
          </div>
          <div>
            <dt>Runtime</dt>
            <dd>{snapshot?.activeProgramVersionId ? "active" : "stopped"}</dd>
          </div>
        </dl>
      </section>

      <section className="prototype-evidence-grid">
        <article className="prototype-log">
          <h2>Signed delivery trace</h2>
          {snapshot?.deliveries.length ? (
            <ol>
              {snapshot.deliveries
                .slice()
                .reverse()
                .map((delivery) => (
                  <li key={delivery.id}>
                    <span className={`delivery-${delivery.status}`}>{delivery.status}</span>
                    <strong>{delivery.command}</strong>
                    <small>{delivery.detail}</small>
                  </li>
                ))}
            </ol>
          ) : (
            <p>No Host commands delivered yet.</p>
          )}
        </article>
        <article className="prototype-log">
          <h2>Attributed runtime actions</h2>
          {snapshot?.actions.length ? (
            <ol>
              {snapshot.actions
                .slice()
                .reverse()
                .map((action) => (
                  <li key={action.id}>
                    <span>{action.event}</span>
                    <strong>{action.description}</strong>
                    <small>AST node {action.sourceNodeId}</small>
                  </li>
                ))}
            </ol>
          ) : (
            <p>No headless Minecraft actions recorded yet.</p>
          )}
        </article>
      </section>
    </main>
  );
}
