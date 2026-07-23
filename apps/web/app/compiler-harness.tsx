"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  migrateProgram,
  sheepCityCompletedExample,
  sheepCityStarterProgram,
  validateProgram,
  type Program,
  type ScriptKind,
} from "@badgerbots/program-model";
import { compileInstructionGraph } from "@badgerbots/runtime-protocol";

const STORAGE_KEY = "badgerbots:checkpoint1:sheep-city";

interface ConsoleEntry {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
}

export function CompilerHarness() {
  const [program, setProgram] = useState<Program>(() => structuredClone(sheepCityStarterProgram));
  const [activeScript, setActiveScript] = useState<ScriptKind>("player");
  const [mode, setMode] = useState<"blocks" | "text">("blocks");
  const [instructorTools, setInstructorTools] = useState(false);
  const [search, setSearch] = useState("");
  const [text, setText] = useState(() => formatProgram(sheepCityStarterProgram));
  const [savedAt, setSavedAt] = useState<string>("Not saved yet");
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

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const restored = migrateProgram(JSON.parse(stored));
      if (!validateProgram(restored).ok)
        throw new Error("The saved program did not pass validation.");
      setProgram(restored);
      setText(formatProgram(restored));
      writeConsole("success", "Restored the last acknowledged local program.");
    } catch (error) {
      writeConsole(
        "error",
        `Saved work could not be restored: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }, [writeConsole]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(program));
    setSavedAt(
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date()),
    );
  }, [program]);

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
    scriptToWorkspace(getScript(programRef.current, activeScript), workspace);
    suppressBlocklyEvents.current = false;

    let pendingCommit: ReturnType<typeof setTimeout> | undefined;
    const commitWorkspace = () => {
      if (workspace.isDragging()) {
        pendingCommit = setTimeout(commitWorkspace, 50);
        return;
      }
      try {
        const current = getScript(programRef.current, activeScript);
        const script = workspaceToScript(workspace, {
          id: current.id,
          scriptKind: current.scriptKind,
          displayName: current.displayName,
        });
        const nextProgram = replaceProgramScript(programRef.current, script);
        setProgram(nextProgram);
      } catch (error) {
        writeConsole(
          "error",
          error instanceof Error ? error.message : "Blockly conversion failed.",
        );
      }
    };
    const listener = (event: Blockly.Events.Abstract) => {
      if (suppressBlocklyEvents.current || event.isUiEvent) return;
      if (pendingCommit) clearTimeout(pendingCommit);
      pendingCommit = setTimeout(commitWorkspace, 75);
    };
    workspace.addChangeListener(listener);
    return () => {
      if (pendingCommit) clearTimeout(pendingCommit);
      workspace.removeChangeListener(listener);
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, [activeScript, writeConsole]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || mode !== "blocks") return;
    suppressBlocklyEvents.current = true;
    scriptToWorkspace(getScript(program, activeScript), workspace);
    suppressBlocklyEvents.current = false;
  }, [activeScript, mode]);

  useEffect(() => {
    workspaceRef.current?.updateToolbox(createToolbox(search));
  }, [search]);

  const searchResults = useMemo(() => searchBlockCatalog(search), [search]);

  const chooseScript = (scriptKind: ScriptKind) => {
    setActiveScript(scriptKind);
    setMode("blocks");
  };

  const switchMode = (nextMode: "blocks" | "text") => {
    if (nextMode === "text" && !instructorTools) return;
    if (nextMode === "text") setText(formatProgram(program));
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
    setProgram(result.program);
    setText(formatProgram(result.program));
    writeConsole(
      "success",
      "Supported text parsed into the canonical AST. Blocks are ready to regenerate.",
    );
  };

  const validate = () => {
    const result = validateProgram(program);
    if (!result.ok) {
      for (const diagnostic of result.diagnostics.slice(0, 5))
        writeConsole("error", diagnostic.message);
      return;
    }
    const graph = compileInstructionGraph(program);
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
    setProgram(copy);
    setText(formatProgram(copy));
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
            <h1>Sheep City compiler proof</h1>
          </div>
        </div>
        <div className="proof-badge">
          <span aria-hidden="true" />
          Checkpoint 1 · browser only
        </div>
      </header>

      <section className="notice" aria-label="Prototype limitation">
        <strong>No Minecraft connection:</strong> this harness proves blocks, text, validation,
        serialization, and local autosave only.
      </section>

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
            <label className="instructor-toggle">
              <input
                type="checkbox"
                checked={instructorTools}
                onChange={(event) => {
                  setInstructorTools(event.target.checked);
                  if (!event.target.checked) setMode("blocks");
                }}
              />
              Local instructor tools
            </label>
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
            <ul>
              {searchResults.map((entry) => (
                <li key={entry.type}>
                  <span>{entry.category}</span>
                  {entry.label}
                </li>
              ))}
            </ul>
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
                  onChange={(event) => setText(event.target.value)}
                />
                <button className="primary" type="button" onClick={applyText}>
                  Parse text into blocks
                </button>
              </div>
            ) : null}
          </section>
        </div>

        <footer className="actionbar">
          <div className="save-state">
            <span aria-hidden="true">✓</span> Local save acknowledged at {savedAt}
          </div>
          <div className="actions">
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
              onClick={() => loadFixture(sheepCityCompletedExample, "Completed compiler fixture")}
            >
              Load completed fixture
            </button>
            <button type="button" className="primary" onClick={validate}>
              Validate &amp; compile preview
            </button>
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
    </main>
  );
}
