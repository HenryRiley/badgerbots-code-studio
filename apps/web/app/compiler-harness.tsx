"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Blockly,
  blockCatalog,
  createToolbox,
  getScript,
  registerSheepCityBlocks,
  replaceProgramScript,
  searchBlockCatalog,
  scriptToWorkspace,
  workspaceToScript,
} from "@badgerbots/block-editor";
import { formatProgram, parseProgram } from "@badgerbots/java-dsl";
import {
  sheepCityCompletedExample,
  sheepCityStarterProgram,
  validateProgram,
  type Program,
  type ScriptKind,
} from "@badgerbots/program-model";
import { compileInstructionGraph } from "@badgerbots/runtime-protocol";
import {
  loadLocalEditorState,
  saveLocalEditorState,
  type LocalEditorState,
} from "./local-editor-storage";
import {
  acceptBoundWorkspaceProgram,
  autosaveBoundProgram,
  callClassroomApi,
  classroomClient,
  loadBoundWorkspaceState,
  loadClassroomBinding,
  subscribeToClassroom,
  unbindWorkspace,
  type BoundWorkspaceState,
  type ClassroomBinding,
} from "./classroom/classroom-api";

interface ConsoleEntry {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
}

interface SaveStatus {
  kind: "loading" | "saving" | "saved" | "draft" | "error";
  message: string;
}

export function CompilerHarness() {
  const classroomHostedAtRoot = process.env.NEXT_PUBLIC_BADGERBOTS_CLASSROOM_AT_ROOT === "1";
  const [program, setProgram] = useState<Program>(() => structuredClone(sheepCityStarterProgram));
  const [activeScript, setActiveScript] = useState<ScriptKind>("player");
  const [mode, setMode] = useState<"blocks" | "text">("blocks");
  const [instructorTools, setInstructorTools] = useState(false);
  const [search, setSearch] = useState("");
  const [text, setText] = useState(() => formatProgram(sheepCityStarterProgram));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    kind: "loading",
    message: "Loading local work…",
  });
  const [workspaceSyncVersion, setWorkspaceSyncVersion] = useState(0);
  const [editorLoaded, setEditorLoaded] = useState(false);
  const [classroomBinding, setClassroomBinding] = useState<ClassroomBinding>();
  const [cloudState, setCloudState] = useState<BoundWorkspaceState>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [classroomBusy, setClassroomBusy] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string>();
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([
    {
      id: 1,
      tone: "info",
      message: "Compiler proof ready. This page does not connect to Minecraft.",
    },
  ]);
  const mountRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const programRef = useRef(program);
  const editorStateRef = useRef<LocalEditorState>({
    editorStateVersion: 1,
    program,
    workspaceDrafts: {},
  });
  const commitWorkspaceRef = useRef<(() => boolean) | null>(null);
  const suppressBlocklyEvents = useRef(false);
  const entryId = useRef(2);

  programRef.current = program;

  const writeConsole = useCallback((tone: ConsoleEntry["tone"], message: string) => {
    setConsoleEntries((current) => {
      const previous = current.at(-1);
      if (previous?.tone === tone && previous.message === message) return current;
      return [...current.slice(-7), { id: entryId.current++, tone, message }];
    });
  }, []);

  const persistEditorState = useCallback(
    (state: LocalEditorState, kind: SaveStatus["kind"] = "saved") => {
      editorStateRef.current = state;
      const result = saveLocalEditorState(localStorage, state);
      if (!result.ok) {
        setSaveStatus({ kind: "error", message: `Local save failed: ${result.message}` });
        writeConsole("error", `Local save failed: ${result.message}`);
        return false;
      }
      const time = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date());
      setSaveStatus({
        kind,
        message:
          kind === "draft"
            ? `Editor draft saved at ${time}; runnable code remains on the last valid version`
            : `Local program and blocks saved at ${time}`,
      });
      return true;
    },
    [writeConsole],
  );

  useEffect(() => {
    const restored = loadLocalEditorState(localStorage);
    setClassroomBinding(loadClassroomBinding());
    if (restored.kind === "loaded") {
      editorStateRef.current = restored.state;
      programRef.current = restored.state.program;
      setProgram(restored.state.program);
      setText(restored.state.textDraft ?? formatProgram(restored.state.program));
      setWorkspaceSyncVersion((version) => version + 1);
      setSaveStatus(
        restored.state.textDraft === undefined
          ? { kind: "saved", message: "Restored saved local program and blocks" }
          : {
              kind: "draft",
              message: "Restored an editor draft; runnable code remains on the last valid version",
            },
      );
      writeConsole("success", "Restored the last acknowledged local program and visual draft.");
      setEditorLoaded(true);
      return;
    }
    if (restored.kind === "error") {
      writeConsole(
        "error",
        `Saved work could not be restored: ${restored.message}. It was not overwritten.`,
      );
      setSaveStatus({ kind: "error", message: "Existing local save could not be read" });
      setEditorLoaded(true);
      return;
    }
    persistEditorState(editorStateRef.current);
    setEditorLoaded(true);
  }, [persistEditorState, writeConsole]);

  useEffect(() => {
    if (!editorLoaded) return;
    const timeout = window.setTimeout(() => {
      void autosaveBoundProgram(program)
        .then((result) => {
          if (result.kind === "saved") {
            setClassroomBinding(loadClassroomBinding());
            setSaveStatus({
              kind: "saved",
              message: `Local save acknowledged; cloud revision ${result.revision} synced`,
            });
            writeConsole("success", `Cloud autosave accepted revision ${result.revision}.`);
            setSyncNotice(`Code updated · revision ${result.revision}`);
          } else if (result.kind === "conflict") {
            setSaveStatus({
              kind: "error",
              message: `Cloud conflict at revision ${result.actualRevision}; local blocks are preserved`,
            });
            writeConsole(
              "error",
              `Cloud revision ${result.actualRevision} changed first. Your local blocks were preserved; return to Connected Classroom to review before retrying.`,
            );
          }
        })
        .catch((caught: unknown) => {
          setSaveStatus({
            kind: "error",
            message: "Local save is safe; cloud autosave is offline",
          });
          writeConsole(
            "error",
            `Cloud autosave failed: ${caught instanceof Error ? caught.message : "unknown error"}. Local work is still saved.`,
          );
        });
    }, 1_500);
    return () => window.clearTimeout(timeout);
  }, [editorLoaded, program, writeConsole]);

  const refreshCloudState = useCallback(async () => {
    const currentBinding = loadClassroomBinding();
    if (!currentBinding) return;
    const next = await loadBoundWorkspaceState();
    if (!next) return;
    setCloudState(next);
    const normalizedBinding = loadClassroomBinding();
    if (normalizedBinding?.sessionId !== classroomBinding?.sessionId) {
      setClassroomBinding(normalizedBinding);
    }
    const remoteRevision = Number(next.workspace.revision);
    if (remoteRevision <= currentBinding.revision) return;
    const remoteProgram = next.workspace.canonical_program;
    if (!acceptBoundWorkspaceProgram(remoteProgram, remoteRevision)) {
      setSyncNotice(
        `Revision ${remoteRevision} is available, but your unsynced local draft was preserved`,
      );
      setSaveStatus({
        kind: "error",
        message: `Remote revision ${remoteRevision} is waiting; local blocks were not overwritten`,
      });
      return;
    }
    const nextState: LocalEditorState = {
      editorStateVersion: 1,
      program: structuredClone(remoteProgram),
      workspaceDrafts: {},
    };
    editorStateRef.current = nextState;
    programRef.current = remoteProgram;
    setProgram(remoteProgram);
    setText(formatProgram(remoteProgram));
    setWorkspaceSyncVersion((version) => version + 1);
    setClassroomBinding(loadClassroomBinding());
    setSaveStatus({
      kind: "saved",
      message: `Cloud revision ${remoteRevision} received and blocks updated`,
    });
    setSyncNotice(`Code updated from instructor · revision ${remoteRevision}`);
    writeConsole("success", `Cloud revision ${remoteRevision} updated this block workspace.`);
  }, [classroomBinding?.sessionId, writeConsole]);

  useEffect(() => {
    if (!editorLoaded || !classroomBinding) return;
    void refreshCloudState().catch(() => undefined);
    const channel = classroomBinding.sessionId
      ? subscribeToClassroom(classroomBinding.sessionId, () => {
          void refreshCloudState().catch(() => undefined);
        })
      : undefined;
    const poll = window.setInterval(() => {
      void refreshCloudState().catch(() => undefined);
    }, 10_000);
    return () => {
      window.clearInterval(poll);
      if (channel) void classroomClient().removeChannel(channel);
    };
  }, [classroomBinding, editorLoaded, refreshCloudState]);

  const queueClassroomCommand = async (commandKind: "deploy_program" | "stop_program") => {
    const binding = loadClassroomBinding();
    if (!binding) return;
    setClassroomBusy(true);
    try {
      commitWorkspaceRef.current?.();
      const saved = await autosaveBoundProgram(programRef.current);
      if (saved.kind === "conflict") {
        throw new Error(
          `Cloud revision ${saved.actualRevision} changed first. Review the update before running.`,
        );
      }
      if (saved.kind === "saved") setClassroomBinding(loadClassroomBinding());
      const result = await callClassroomApi<{ status: string }>("queue_runtime", {
        workspaceId: binding.workspaceId,
        commandKind,
      });
      const label = commandKind === "deploy_program" ? "Run" : "Stop";
      setSyncNotice(`${label} sent · ${result.status}`);
      writeConsole("success", `${label} command accepted by the classroom service.`);
      await refreshCloudState();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Classroom command failed.";
      setSyncNotice(message);
      writeConsole("error", message);
    } finally {
      setClassroomBusy(false);
    }
  };

  const askForHelp = async () => {
    setClassroomBusy(true);
    try {
      await callClassroomApi("request_help", {
        summary: "I need help with my Sheep City program.",
      });
      setSyncNotice("Help request sent to your instructor");
    } catch (caught) {
      setSyncNotice(caught instanceof Error ? caught.message : "Help request failed.");
    } finally {
      setClassroomBusy(false);
    }
  };

  const leaveClassroom = async () => {
    await classroomClient().auth.signOut();
    unbindWorkspace();
    window.location.assign(classroomHostedAtRoot ? "/classroom/" : "/classroom");
  };

  useEffect(() => {
    if (!mountRef.current || workspaceRef.current) return;
    registerSheepCityBlocks();
    const workspace = Blockly.inject(mountRef.current, {
      toolbox: createToolbox(),
      renderer: "zelos",
      trashcan: true,
      sounds: false,
      grid: { spacing: 24, length: 3, colour: "#c8d8df", snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 1.5, minScale: 0.55 },
    });
    workspaceRef.current = workspace;
    suppressBlocklyEvents.current = true;
    Blockly.Events.disable();
    try {
      const draft = editorStateRef.current.workspaceDrafts[activeScript];
      if (draft) {
        try {
          Blockly.serialization.workspaces.load(draft, workspace);
        } catch (error) {
          writeConsole(
            "error",
            `The ${activeScript} visual draft could not be restored; the last valid program was used. ${
              error instanceof Error ? error.message : ""
            }`,
          );
          scriptToWorkspace(getScript(programRef.current, activeScript), workspace);
        }
      } else {
        scriptToWorkspace(getScript(programRef.current, activeScript), workspace);
      }
    } finally {
      Blockly.Events.enable();
      suppressBlocklyEvents.current = false;
    }

    let pendingCommit: ReturnType<typeof setTimeout> | undefined;
    let workspaceDirty = false;
    const commitWorkspace = (): boolean => {
      if (pendingCommit) {
        clearTimeout(pendingCommit);
        pendingCommit = undefined;
      }
      if (workspace.isDragging()) {
        pendingCommit = setTimeout(commitWorkspace, 50);
        return false;
      }
      const workspaceDraft = Blockly.serialization.workspaces.save(workspace);
      const workspaceDrafts = {
        ...editorStateRef.current.workspaceDrafts,
        [activeScript]: workspaceDraft,
      };
      const preservedTextDraft =
        !workspaceDirty && editorStateRef.current.textDraft !== undefined
          ? { textDraft: editorStateRef.current.textDraft }
          : {};
      try {
        const current = getScript(programRef.current, activeScript);
        const script = workspaceToScript(workspace, {
          id: current.id,
          scriptKind: current.scriptKind,
          displayName: current.displayName,
        });
        const nextProgram = replaceProgramScript(programRef.current, script);
        programRef.current = nextProgram;
        setProgram(nextProgram);
        persistEditorState(
          {
            editorStateVersion: 1,
            program: nextProgram,
            workspaceDrafts,
            ...preservedTextDraft,
          },
          preservedTextDraft.textDraft === undefined ? "saved" : "draft",
        );
        workspaceDirty = false;
        return true;
      } catch (error) {
        persistEditorState(
          {
            editorStateVersion: 1,
            program: programRef.current,
            workspaceDrafts,
            ...preservedTextDraft,
          },
          "draft",
        );
        workspaceDirty = false;
        writeConsole(
          "error",
          error instanceof Error ? error.message : "Blockly conversion failed.",
        );
        return false;
      }
    };
    commitWorkspaceRef.current = commitWorkspace;
    const listener = (event: Blockly.Events.Abstract) => {
      if (suppressBlocklyEvents.current || event.isUiEvent || !event.recordUndo) return;
      if (pendingCommit) clearTimeout(pendingCommit);
      workspaceDirty = true;
      setSaveStatus({ kind: "saving", message: "Saving local changes…" });
      pendingCommit = setTimeout(commitWorkspace, 75);
    };
    workspace.addChangeListener(listener);
    return () => {
      if (pendingCommit) clearTimeout(pendingCommit);
      commitWorkspaceRef.current = null;
      workspace.removeChangeListener(listener);
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, [activeScript, persistEditorState, workspaceSyncVersion, writeConsole]);

  useEffect(() => {
    const flush = () => commitWorkspaceRef.current?.();
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, []);

  useEffect(() => {
    workspaceRef.current?.updateToolbox(createToolbox(search));
  }, [search]);

  const searchResults = useMemo(() => searchBlockCatalog(search), [search]);

  const chooseScript = (scriptKind: ScriptKind) => {
    commitWorkspaceRef.current?.();
    setActiveScript(scriptKind);
    setMode("blocks");
  };

  const switchMode = (nextMode: "blocks" | "text") => {
    if (nextMode === "text" && !instructorTools) return;
    if (nextMode === "text") {
      if (!commitWorkspaceRef.current?.()) {
        writeConsole("error", "Connect or complete all blocks before opening text mode.");
        return;
      }
      setText(editorStateRef.current.textDraft ?? formatProgram(programRef.current));
    }
    setMode(nextMode);
  };

  const applyText = () => {
    const result = parseProgram(text);
    if (!result.ok) {
      const first = result.diagnostics[0];
      writeConsole(
        "error",
        `${first?.message ?? "Text could not be parsed"} (line ${first?.line ?? 1}, column ${first?.column ?? 1}) ${first?.suggestion ?? ""}`,
      );
      return;
    }
    programRef.current = result.program;
    setProgram(result.program);
    setText(formatProgram(result.program));
    const nextState: LocalEditorState = {
      editorStateVersion: 1,
      program: result.program,
      workspaceDrafts: {},
    };
    persistEditorState(nextState);
    setWorkspaceSyncVersion((version) => version + 1);
    writeConsole(
      "success",
      "Supported text parsed into the canonical AST. Blocks are ready to regenerate.",
    );
  };

  const validate = () => {
    if (mode === "blocks" && !commitWorkspaceRef.current?.()) {
      writeConsole(
        "error",
        "The visual draft is saved, but incomplete or loose blocks cannot run.",
      );
      return;
    }
    const result = validateProgram(programRef.current);
    if (!result.ok) {
      for (const diagnostic of result.diagnostics.slice(0, 5))
        writeConsole("error", diagnostic.message);
      return;
    }
    const graph = compileInstructionGraph(programRef.current);
    const instructionCount = graph.handlers.reduce(
      (total, handler) => total + handler.instructions.length,
      0,
    );
    writeConsole(
      "success",
      `Valid canonical program: ${graph.handlers.length} event handlers and ${instructionCount} top-level instructions. Nothing was sent to Minecraft.`,
    );
  };

  const loadFixture = (fixture: Program, label: string) => {
    const copy = structuredClone(fixture);
    programRef.current = copy;
    setProgram(copy);
    setText(formatProgram(copy));
    persistEditorState({ editorStateVersion: 1, program: copy, workspaceDrafts: {} });
    setWorkspaceSyncVersion((version) => version + 1);
    writeConsole("info", `${label} loaded into local browser storage.`);
  };

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            BB
          </span>
          <div>
            <p className="eyebrow">BadgerBots Code Studio</p>
            <h1>{classroomBinding ? "Sheep City" : "Sheep City compiler proof"}</h1>
          </div>
        </div>
        <div className="header-actions">
          {classroomBinding ? (
            <>
              <button
                className="studio-run-button"
                type="button"
                disabled={classroomBusy}
                onClick={() => void queueClassroomCommand("deploy_program")}
              >
                ▶ Run
              </button>
              <button className="header-link" type="button" onClick={() => setDrawerOpen(true)}>
                Classroom controls
              </button>
            </>
          ) : (
            <Link className="header-link" href={classroomHostedAtRoot ? "/" : "/classroom"}>
              Connected classroom
            </Link>
          )}
          {classroomHostedAtRoot ? null : (
            <>
              <Link className="header-link" href="/curriculum">
                Curriculum lab
              </Link>
              <Link className="header-link" href="/prototype">
                Connected prototype
              </Link>
            </>
          )}
          <div className="proof-badge">
            <span aria-hidden="true" />
            {classroomHostedAtRoot ? "Internal classroom prototype" : "Checkpoint 1 · browser only"}
          </div>
        </div>
      </header>

      <section className="notice" aria-label="Prototype limitation">
        <strong>{classroomBinding ? "Live classroom workspace:" : "Block editor:"}</strong>{" "}
        {classroomBinding
          ? "Changes save automatically. Instructor updates arrive here without leaving the editor."
          : "Work saves locally immediately. Open a classroom workspace to sync and run in Minecraft."}
      </section>

      {syncNotice ? (
        <div className="sync-confirmation" role="status">
          <span aria-hidden="true">✓</span>
          {syncNotice}
          <button type="button" aria-label="Dismiss confirmation" onClick={() => setSyncNotice("")}>
            ×
          </button>
        </div>
      ) : null}

      <section className="workspace-card">
        <div className="workspace-toolbar">
          <div className="script-tabs" role="tablist" aria-label="Code areas">
            {(["player", "game", "sheep"] as const).map((kind) => (
              <button
                key={kind}
                className={activeScript === kind ? "tab active" : "tab"}
                type="button"
                role="tab"
                aria-selected={activeScript === kind}
                onClick={() => chooseScript(kind)}
              >
                {getScript(program, kind).displayName}
              </button>
            ))}
          </div>
          <div className="mode-controls">
            {!classroomBinding || classroomBinding.role === "instructor" ? (
              <label className="instructor-toggle">
                <input
                  type="checkbox"
                  checked={instructorTools}
                  onChange={(event) => {
                    setInstructorTools(event.target.checked);
                    if (!event.target.checked) setMode("blocks");
                  }}
                />
                Instructor text mode
              </label>
            ) : null}
            <div className="segmented" aria-label="Editor mode">
              <button
                type="button"
                className={mode === "blocks" ? "selected" : ""}
                onClick={() => switchMode("blocks")}
              >
                Blocks
              </button>
              <button
                type="button"
                className={mode === "text" ? "selected" : ""}
                disabled={!instructorTools}
                onClick={() => switchMode("text")}
              >
                Text
              </button>
            </div>
          </div>
        </div>

        <div className="editor-layout">
          <aside className="library-panel" aria-label="Block library search">
            <label htmlFor="block-search">Search all implemented blocks</label>
            <input
              id="block-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Try gold, sheep, arrow…"
            />
            <p>
              {searchResults.length} of {blockCatalog.length} blocks available
            </p>
            <p className="library-hint">
              Choose a category beside the canvas, then drag blocks into your event.
            </p>
          </aside>

          <section className="editor-panel" aria-label={`${mode} editor`}>
            <div
              ref={mountRef}
              className={mode === "blocks" ? "blockly-mount" : "blockly-mount hidden"}
            />
            {mode === "text" ? (
              <div className="text-editor">
                <div className="text-header">
                  <strong>Restricted Java-style view</strong>
                  <span>Unsupported Java is rejected</span>
                </div>
                <textarea
                  aria-label="Restricted Java-style program"
                  spellCheck={false}
                  value={text}
                  onChange={(event) => {
                    const value = event.target.value;
                    setText(value);
                    persistEditorState({ ...editorStateRef.current, textDraft: value }, "draft");
                  }}
                />
                <button className="primary" type="button" onClick={applyText}>
                  Parse text into blocks
                </button>
              </div>
            ) : null}
          </section>
        </div>

        <footer className="actionbar">
          <div className={`save-state ${saveStatus.kind}`} role="status">
            <span aria-hidden="true">
              {saveStatus.kind === "saved" ? "✓" : saveStatus.kind === "error" ? "!" : "•"}
            </span>
            {saveStatus.message}
          </div>
          <div className="actions">
            {!classroomBinding ? (
              <>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => loadFixture(sheepCityStarterProgram, "Starter fixture")}
                >
                  Restore starter
                </button>
                <button
                  type="button"
                  className="quiet"
                  onClick={() =>
                    loadFixture(sheepCityCompletedExample, "Completed compiler fixture")
                  }
                >
                  Load completed fixture
                </button>
              </>
            ) : null}
            {classroomBinding ? (
              <button
                type="button"
                className="primary"
                disabled={classroomBusy}
                onClick={() => void queueClassroomCommand("deploy_program")}
              >
                ▶ Run in Minecraft
              </button>
            ) : (
              <button type="button" className="primary" onClick={validate}>
                Validate &amp; compile preview
              </button>
            )}
          </div>
        </footer>
      </section>

      <section className="console-card" aria-live="polite">
        <div className="console-title">
          <h2>Compiler console</h2>
          <button type="button" onClick={() => setConsoleEntries([])}>
            Clear
          </button>
        </div>
        <div className="console-output">
          {consoleEntries.length === 0 ? (
            <p className="empty">No compiler messages.</p>
          ) : (
            consoleEntries.map((entry) => (
              <p key={entry.id} className={entry.tone}>
                <span>{entry.tone === "success" ? "OK" : entry.tone === "error" ? "!" : "i"}</span>
                {entry.message}
              </p>
            ))
          )}
        </div>
      </section>

      {classroomBinding ? (
        <>
          <button
            className={drawerOpen ? "drawer-scrim open" : "drawer-scrim"}
            type="button"
            aria-label="Close classroom controls"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className={drawerOpen ? "classroom-drawer open" : "classroom-drawer"}
            aria-label="Classroom controls"
            aria-hidden={!drawerOpen}
            inert={!drawerOpen}
          >
            <div className="drawer-heading">
              <div>
                <p className="eyebrow">Connected workspace</p>
                <h2>Sheep City controls</h2>
              </div>
              <button
                className="drawer-close"
                type="button"
                aria-label="Close classroom controls"
                onClick={() => setDrawerOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="drawer-status-grid">
              <div>
                <small>Cloud revision</small>
                <strong>{cloudState?.workspace.revision ?? classroomBinding.revision}</strong>
              </div>
              <div>
                <small>Minecraft</small>
                <strong>
                  {cloudState?.workspace.active_runtime_version_id ? "Running" : "Stopped"}
                </strong>
              </div>
              <div>
                <small>Editing as</small>
                <strong>{classroomBinding.role === "instructor" ? "Instructor" : "Student"}</strong>
              </div>
            </div>
            <div className="drawer-primary-actions">
              <button
                className="primary-button"
                disabled={classroomBusy}
                onClick={() => void queueClassroomCommand("deploy_program")}
              >
                ▶ Run latest code
              </button>
              <button
                className="danger-button"
                disabled={classroomBusy}
                onClick={() => void queueClassroomCommand("stop_program")}
              >
                ■ Stop program
              </button>
            </div>
            <div className="drawer-message" aria-live="polite">
              <strong>Latest activity</strong>
              <span>
                {syncNotice ??
                  (cloudState?.latestCommand
                    ? `${cloudState.latestCommand.command_kind}: ${cloudState.latestCommand.status}`
                    : "Code is connected and ready.")}
              </span>
            </div>
            {classroomBinding.role === "camper" ? (
              <button
                className="secondary-button"
                disabled={classroomBusy}
                onClick={() => void askForHelp()}
              >
                Raise hand
              </button>
            ) : (
              <Link
                className="secondary-button drawer-link"
                href={classroomHostedAtRoot ? "/" : "/classroom"}
              >
                Return to instructor roster
              </Link>
            )}
            <button className="drawer-signout" type="button" onClick={() => void leaveClassroom()}>
              Sign out of classroom
            </button>
          </aside>
        </>
      ) : null}
    </main>
  );
}
