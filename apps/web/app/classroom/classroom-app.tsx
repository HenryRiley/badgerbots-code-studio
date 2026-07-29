"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Program } from "@badgerbots/program-model";
import {
  bindWorkspace,
  callClassroomApi,
  classroomClient,
  classroomConfigured,
  loadClassroomBinding,
  localRunnableProgram,
  sendCamperHeartbeat,
  subscribeToClassroom,
  unbindWorkspace,
} from "./classroom-api";

interface Profile {
  instructorId: string;
  memberships: { organization_id: string; role: "owner" | "assistant" }[];
  organizations: { id: string; name: string }[];
  locations: { id: string; organization_id: string; name: string }[];
}

interface CampSession {
  id: string;
  location_id: string;
  track_id: string;
  starts_on: string;
  ends_on: string;
  retention_state: string;
}

interface WorkspaceRow {
  id: string;
  organization_id?: string;
  session_id?: string;
  camper_id: string;
  revision: number;
  canonical_program: Program;
  active_runtime_version_id?: string;
  updated_at: string;
}

interface ClassroomSnapshot {
  session: {
    id: string;
    organization_id: string;
    location_id: string;
    track_id: string;
    starts_on: string;
    ends_on: string;
    retention_state: string;
  };
  campers: { id: string; first_name: string; last_initial: string }[];
  workspaces: WorkspaceRow[];
  help: { id: string; camper_id: string; state: string; summary?: string }[];
  commands: {
    id: string;
    workspace_id: string;
    command_kind: string;
    status: string;
    acknowledgement_code?: string;
  }[];
  health: { subject_kind: string; subject_id: string; state: string; observed_at: string }[];
  hosts: { id: string; display_name: string; last_seen_at?: string }[];
  deviceMappings: {
    camperId: string;
    deviceId: string | null;
    devicePublicId: string | null;
    minecraftUsername: string | null;
  }[];
}

interface StudentState {
  organizationId: string;
  sessionId: string;
  camperId: string;
  workspaceId: string;
  displayName: string;
  revision: number;
  program: Program;
  activeRuntimeVersionId?: string;
}

type AppMode = "loading" | "landing" | "instructor" | "student";

export function ClassroomApp() {
  const [mode, setMode] = useState<AppMode>("loading");
  const [profile, setProfile] = useState<Profile>();
  const [sessions, setSessions] = useState<CampSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [snapshot, setSnapshot] = useState<ClassroomSnapshot>();
  const [student, setStudent] = useState<StudentState>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Checking saved classroom access…");
  const [error, setError] = useState<string>();

  const loadInstructor = useCallback(async () => {
    const nextProfile = await callClassroomApi<Profile>("profile");
    const sessionResult = await callClassroomApi<{ sessions: CampSession[] }>("list_sessions");
    setProfile(nextProfile);
    setSessions(sessionResult.sessions);
    setMode("instructor");
    setMessage("Instructor account connected.");
    return { profile: nextProfile, sessions: sessionResult.sessions };
  }, []);

  const loadStudent = useCallback(async () => {
    const result = await callClassroomApi<{ workspace: WorkspaceRow }>("workspace");
    const workspace = result.workspace;
    const next: StudentState = {
      organizationId: workspace.organization_id ?? "",
      sessionId: workspace.session_id ?? "",
      camperId: workspace.camper_id,
      workspaceId: workspace.id,
      displayName: "Student",
      revision: Number(workspace.revision),
      program: workspace.canonical_program,
      ...(workspace.active_runtime_version_id
        ? { activeRuntimeVersionId: workspace.active_runtime_version_id }
        : {}),
    };
    const savedIdentity = localStorage.getItem("badgerbots:classroom:student:v1");
    if (savedIdentity) {
      try {
        const saved = JSON.parse(savedIdentity) as Partial<StudentState>;
        if (saved.workspaceId === workspace.id) {
          next.displayName =
            typeof saved.displayName === "string" ? saved.displayName : next.displayName;
        } else {
          localStorage.removeItem("badgerbots:classroom:student:v1");
        }
      } catch {
        localStorage.removeItem("badgerbots:classroom:student:v1");
      }
    }
    setStudent(next);
    setMode("student");
    setMessage("Student workspace recovered.");
  }, []);

  useEffect(() => {
    if (!classroomConfigured()) {
      setMode("landing");
      setError(
        "Classroom Web is not configured. Add the two NEXT_PUBLIC_SUPABASE values and restart Web.",
      );
      return;
    }
    void classroomClient()
      .auth.getSession()
      .then(async ({ data }) => {
        if (!data.session) {
          setMode("landing");
          setMessage("Choose instructor sign-in or student class-code join.");
          return;
        }
        try {
          await loadInstructor();
        } catch {
          try {
            await loadStudent();
          } catch {
            await classroomClient().auth.signOut();
            setMode("landing");
            setMessage("Saved classroom access expired. Join or sign in again.");
          }
        }
      });
  }, [loadInstructor, loadStudent]);

  const refreshSnapshot = useCallback(async () => {
    if (!selectedSessionId) return;
    const result = await callClassroomApi<ClassroomSnapshot>("session_snapshot", {
      sessionId: selectedSessionId,
    });
    setSnapshot(result);
  }, [selectedSessionId]);

  useEffect(() => {
    if (mode !== "instructor" || !selectedSessionId) return;
    void refreshSnapshot();
    const channel = subscribeToClassroom(selectedSessionId, () => void refreshSnapshot());
    const poll = window.setInterval(() => void refreshSnapshot(), 5 * 60_000);
    return () => {
      window.clearInterval(poll);
      void classroomClient().removeChannel(channel);
    };
  }, [mode, refreshSnapshot, selectedSessionId]);

  const refreshStudent = useCallback(async () => {
    if (!student) return;
    const result = await callClassroomApi<{ workspace: WorkspaceRow }>("workspace");
    setStudent((current) =>
      current
        ? {
            ...current,
            revision: Number(result.workspace.revision),
            program: result.workspace.canonical_program,
            ...(result.workspace.active_runtime_version_id
              ? { activeRuntimeVersionId: result.workspace.active_runtime_version_id }
              : {}),
          }
        : current,
    );
  }, [student]);

  useEffect(() => {
    if (mode !== "student" || !student?.sessionId) return;
    const channel = subscribeToClassroom(student.sessionId, () => void refreshStudent());
    const poll = window.setInterval(() => void refreshStudent(), 5 * 60_000);
    const heartbeat = window.setInterval(
      () => void sendCamperHeartbeat(student).catch(() => undefined),
      45_000,
    );
    void sendCamperHeartbeat(student).catch(() => undefined);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(heartbeat);
      void classroomClient().removeChannel(channel);
    };
  }, [mode, refreshStudent, student?.sessionId]);

  async function perform(work: () => Promise<string>): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      setMessage(await work());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Classroom action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut(): Promise<void> {
    await classroomClient().auth.signOut();
    localStorage.removeItem("badgerbots:classroom:student:v1");
    unbindWorkspace();
    setProfile(undefined);
    setStudent(undefined);
    setSnapshot(undefined);
    setSessions([]);
    setSelectedSessionId("");
    setMode("landing");
    setMessage("Signed out.");
  }

  return (
    <main className="classroom-shell">
      <header className="classroom-topbar">
        <div>
          <p className="eyebrow">BadgerBots Code Studio</p>
          <h1>Connected Classroom</h1>
        </div>
        <div className="button-row">
          <Link className="secondary-button" href="/">
            Block editor
          </Link>
          {mode === "instructor" || mode === "student" ? (
            <button className="secondary-button" type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      <section className="classroom-status" aria-live="polite">
        <span className={error ? "status-dot error" : "status-dot ready"} />
        <span>{error ?? message}</span>
      </section>

      {mode === "loading" ? <p>Loading protected classroom state…</p> : null}
      {mode === "landing" ? (
        <Landing
          busy={busy}
          perform={perform}
          onInstructor={loadInstructor}
          onStudent={(next) => {
            setStudent(next);
            setMode("student");
          }}
        />
      ) : null}
      {mode === "instructor" && profile ? (
        <InstructorDashboard
          busy={busy}
          profile={profile}
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          snapshot={snapshot}
          setSelectedSessionId={setSelectedSessionId}
          perform={perform}
          onSessions={setSessions}
          refreshSnapshot={refreshSnapshot}
        />
      ) : null}
      {mode === "student" && student ? (
        <StudentWorkspace
          busy={busy}
          student={student}
          perform={perform}
          refresh={refreshStudent}
        />
      ) : null}
    </main>
  );
}

function Landing(props: {
  busy: boolean;
  perform(work: () => Promise<string>): Promise<void>;
  onInstructor(): Promise<unknown>;
  onStudent(student: StudentState): void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [devicePublicId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("bbDevice") ?? ""),
  );

  const instructorLogin = () =>
    props.perform(async () => {
      const { error } = await classroomClient().auth.signInWithPassword({ email, password });
      if (error) throw new Error("Instructor email or password was not accepted.");
      await props.onInstructor();
      return "Instructor account connected.";
    });

  const join = () =>
    props.perform(async () => {
      const result = await callClassroomApi<{
        sessionId: string;
        organizationId: string;
        camperId: string;
        workspaceId: string;
        displayName: string;
        accessToken: string;
        refreshToken: string;
        revision: number;
        program: Program;
      }>(
        "join",
        {
          joinCode,
          firstName,
          lastInitial,
          ...(devicePublicId ? { devicePublicId } : {}),
        },
        "",
      );
      const { error } = await classroomClient().auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      if (error) throw new Error("Student access could not be stored.");
      const student: StudentState = {
        organizationId: result.organizationId,
        sessionId: result.sessionId,
        camperId: result.camperId,
        workspaceId: result.workspaceId,
        displayName: result.displayName,
        revision: Number(result.revision),
        program: result.program,
      };
      localStorage.setItem("badgerbots:classroom:student:v1", JSON.stringify(student));
      bindWorkspace(
        {
          version: 1,
          workspaceId: student.workspaceId,
          revision: student.revision,
          role: "camper",
        },
        student.program,
      );
      props.onStudent(student);
      return `${student.displayName} joined Sheep City.`;
    });

  return (
    <section className="classroom-choice-grid">
      <form
        className="classroom-card"
        onSubmit={(event) => {
          event.preventDefault();
          void instructorLogin();
        }}
      >
        <p className="eyebrow">Instructor</p>
        <h2>Email and password</h2>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="primary-button" type="submit" disabled={props.busy}>
          Sign in
        </button>
      </form>

      <form
        className="classroom-card"
        onSubmit={(event) => {
          event.preventDefault();
          void join();
        }}
      >
        <p className="eyebrow">Student</p>
        <h2>Join this week’s camp</h2>
        <p className={devicePublicId ? "device-link ready" : "device-link warning"}>
          {devicePublicId
            ? "This coding console is linked to BadgerBots Connect on this laptop."
            : "Open this page from BadgerBots Connect to link Minecraft to the correct camper."}
        </p>
        <label>
          Class code
          <input
            value={joinCode}
            maxLength={8}
            autoCapitalize="characters"
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          />
        </label>
        <label>
          First name
          <input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </label>
        <label>
          Last initial
          <input
            value={lastInitial}
            maxLength={1}
            onChange={(event) => setLastInitial(event.target.value.toUpperCase())}
          />
        </label>
        <button className="primary-button" type="submit" disabled={props.busy}>
          Join Sheep City
        </button>
      </form>
    </section>
  );
}

function InstructorDashboard(props: {
  busy: boolean;
  profile: Profile;
  sessions: CampSession[];
  selectedSessionId: string;
  snapshot: ClassroomSnapshot | undefined;
  setSelectedSessionId(value: string): void;
  perform(work: () => Promise<string>): Promise<void>;
  onSessions(value: CampSession[]): void;
  refreshSnapshot(): Promise<void>;
}) {
  const ownerMembership = props.profile.memberships.find((item) => item.role === "owner");
  const primaryMembership = ownerMembership ?? props.profile.memberships[0];
  const organization = props.profile.organizations.find(
    (item) => item.id === primaryMembership?.organization_id,
  );
  const locations = props.profile.locations.filter(
    (item) => item.organization_id === primaryMembership?.organization_id,
  );
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [endsOn, setEndsOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [joinCode, setJoinCode] = useState("");
  const [hostCredentials, setHostCredentials] = useState<{
    hostId: string;
    pairingToken: string;
  }>();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [assistantEmail, setAssistantEmail] = useState("");
  const [assistantPassword, setAssistantPassword] = useState("");
  const [minecraftUsername, setMinecraftUsername] = useState("");

  const selectedWorkspace = props.snapshot?.workspaces.find(
    (item) => item.id === selectedWorkspaceId,
  );
  const selectedDeviceMapping = props.snapshot?.deviceMappings.find(
    (item) => item.camperId === selectedWorkspace?.camper_id,
  );

  const createSession = () =>
    props.perform(async () => {
      if (!ownerMembership || !locationId) throw new Error("Owner location is unavailable.");
      const result = await callClassroomApi<{ sessionId: string; joinCode: string }>(
        "create_session",
        {
          organizationId: ownerMembership.organization_id,
          locationId,
          startsOn,
          endsOn,
          trackId: "grades-3-4",
        },
      );
      const sessions = await callClassroomApi<{ sessions: CampSession[] }>("list_sessions");
      props.onSessions(sessions.sessions);
      props.setSelectedSessionId(result.sessionId);
      setJoinCode(result.joinCode);
      return "Weekly session created. Copy the class code now; it is shown only here.";
    });

  const pairHost = () =>
    props.perform(async () => {
      if (!ownerMembership || !locationId) throw new Error("Owner location is unavailable.");
      const result = await callClassroomApi<{ hostId: string; pairingToken: string }>("pair_host", {
        organizationId: ownerMembership.organization_id,
        locationId,
        displayName: "Teacher Windows Prototype",
      });
      setHostCredentials(result);
      return "A dedicated Host credential was created. Copy it to the teacher PC now.";
    });

  const provisionAssistant = () =>
    props.perform(async () => {
      if (!ownerMembership) throw new Error("Owner organization is unavailable.");
      await callClassroomApi("provision_assistant", {
        organizationId: ownerMembership.organization_id,
        email: assistantEmail,
        temporaryPassword: assistantPassword,
        ...(props.selectedSessionId ? { sessionId: props.selectedSessionId } : {}),
      });
      setAssistantPassword("");
      return props.selectedSessionId
        ? "Assistant account was created and assigned to the selected session."
        : "Assistant account was created. Select a session before provisioning to assign it.";
    });

  const openWorkspace = () => {
    if (!selectedWorkspace) return;
    bindWorkspace(
      {
        version: 1,
        workspaceId: selectedWorkspace.id,
        revision: Number(selectedWorkspace.revision),
        role: "instructor",
      },
      selectedWorkspace.canonical_program,
    );
  };

  const pushWorkspace = () =>
    props.perform(async () => {
      if (!selectedWorkspace) throw new Error("Choose a student first.");
      const binding = loadClassroomBinding();
      if (!binding || binding.workspaceId !== selectedWorkspace.id) {
        throw new Error(
          "Open this student's blocks first. This prevents pushing another student's local draft.",
        );
      }
      const result = await callClassroomApi<{
        result:
          | { kind: "saved"; revision: number }
          | { kind: "revision_conflict"; actual_revision: number };
      }>("save_program", {
        workspaceId: selectedWorkspace.id,
        baseRevision: Number(selectedWorkspace.revision),
        clientMutationId: crypto.randomUUID(),
        program: localRunnableProgram(),
      });
      if (result.result.kind === "revision_conflict") {
        await props.refreshSnapshot();
        throw new Error(
          `The student saved revision ${result.result.actual_revision} first. Their latest code is now shown; review before retrying.`,
        );
      }
      await props.refreshSnapshot();
      return `Instructor revision ${result.result.revision} was pushed to the student.`;
    });

  const queue = (commandKind: "deploy_program" | "stop_program") =>
    props.perform(async () => {
      if (!selectedWorkspace) throw new Error("Choose a student first.");
      const result = await callClassroomApi<{ commandId: string; status: string }>(
        "queue_runtime",
        {
          workspaceId: selectedWorkspace.id,
          commandKind,
        },
      );
      await props.refreshSnapshot();
      return `${commandKind === "deploy_program" ? "Run" : "Stop"} command ${result.commandId} is ${result.status}.`;
    });

  const updateMinecraftMapping = () =>
    props.perform(async () => {
      if (!selectedWorkspace) throw new Error("Choose a student first.");
      if (!selectedDeviceMapping?.deviceId) {
        throw new Error(
          "Ask this camper to open Code Studio from BadgerBots Connect and join again.",
        );
      }
      await callClassroomApi("set_device_mapping", {
        sessionId: props.selectedSessionId,
        camperId: selectedWorkspace.camper_id,
        minecraftUsername,
      });
      setMinecraftUsername("");
      await props.refreshSnapshot();
      return "The device is now mapped to the exact Minecraft username.";
    });

  return (
    <div className="classroom-dashboard-grid">
      <aside className="classroom-card">
        <p className="eyebrow">Instructor</p>
        <h2>{organization?.name ?? "BadgerBots"}</h2>
        {!ownerMembership ? (
          <p className="permission-note">
            Assistant access: you can work with assigned sessions and students. Session, Host, and
            assistant setup require the organization owner.
          </p>
        ) : null}
        <fieldset className="owner-controls" disabled={!ownerMembership}>
          <legend>Owner controls</legend>
          <label>
            Location
            <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <div className="date-grid">
            <label>
              Starts
              <input
                type="date"
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
              />
            </label>
            <label>
              Ends
              <input
                type="date"
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
              />
            </label>
          </div>
          <button
            className="primary-button"
            disabled={props.busy}
            onClick={() => void createSession()}
          >
            Create weekly session
          </button>
          {joinCode ? (
            <div className="one-time-secret">
              <small>Class code—shown once</small>
              <strong>{joinCode}</strong>
            </div>
          ) : null}
          <button
            className="secondary-button"
            disabled={props.busy}
            onClick={() => void pairHost()}
          >
            Pair teacher Host
          </button>
          {hostCredentials ? (
            <div className="host-credential">
              <small>Copy now; the token is shown once</small>
              <code>BADGERBOTS_CLASSROOM_HOST_ID={hostCredentials.hostId}</code>
              <code>BADGERBOTS_CLASSROOM_HOST_TOKEN={hostCredentials.pairingToken}</code>
            </div>
          ) : null}
          <hr />
          <p className="eyebrow">Assistant instructor</p>
          <label>
            Email
            <input
              type="email"
              value={assistantEmail}
              onChange={(event) => setAssistantEmail(event.target.value)}
            />
          </label>
          <label>
            Temporary password
            <input
              type="password"
              minLength={12}
              value={assistantPassword}
              onChange={(event) => setAssistantPassword(event.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            disabled={props.busy}
            onClick={() => void provisionAssistant()}
          >
            Create and assign assistant
          </button>
        </fieldset>
      </aside>

      <section className="classroom-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Weekly sessions</p>
            <h2>Live roster</h2>
          </div>
          <select
            value={props.selectedSessionId}
            onChange={(event) => {
              props.setSelectedSessionId(event.target.value);
              setSelectedWorkspaceId("");
            }}
          >
            <option value="">Choose a session</option>
            {props.sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.starts_on}–{session.ends_on} · {session.retention_state}
              </option>
            ))}
          </select>
        </div>
        {!props.snapshot ? <p>Create or select a session to see students.</p> : null}
        <div className="roster-list">
          {props.snapshot?.campers.map((camper) => {
            const workspace = props.snapshot?.workspaces.find(
              (item) => item.camper_id === camper.id,
            );
            const help = props.snapshot?.help.find((item) => item.camper_id === camper.id);
            const presence = props.snapshot?.health.find(
              (item) => item.subject_kind === "camper_web" && item.subject_id === camper.id,
            );
            const online =
              presence !== undefined && Date.now() - Date.parse(presence.observed_at) < 50_000;
            const deviceMapping = props.snapshot?.deviceMappings.find(
              (item) => item.camperId === camper.id,
            );
            return (
              <button
                type="button"
                className={
                  workspace?.id === selectedWorkspaceId ? "roster-row selected" : "roster-row"
                }
                key={camper.id}
                onClick={() => setSelectedWorkspaceId(workspace?.id ?? "")}
              >
                <strong>
                  {camper.first_name} {camper.last_initial}.
                </strong>
                <span>Revision {workspace?.revision ?? 0}</span>
                <span>{online ? "Web online" : "Web offline"}</span>
                <span>
                  {deviceMapping?.minecraftUsername
                    ? `Minecraft: ${deviceMapping.minecraftUsername}`
                    : deviceMapping?.deviceId
                      ? "Minecraft mapping needed"
                      : "Connect device needed"}
                </span>
                <span>{help ? `Help: ${help.state}` : "No help request"}</span>
              </button>
            );
          })}
        </div>
        {selectedWorkspace ? (
          <div className="workspace-controls">
            <p>
              Selected revision <strong>{selectedWorkspace.revision}</strong>
            </p>
            <div className="minecraft-mapping-control">
              <div>
                <strong>Fixed Minecraft player</strong>
                <p>
                  {selectedDeviceMapping?.minecraftUsername ??
                    (selectedDeviceMapping?.deviceId
                      ? "Assign the username used by this laptop."
                      : "The camper must join from BadgerBots Connect first.")}
                </p>
              </div>
              <input
                aria-label="Exact Minecraft username"
                placeholder="Exact Minecraft username"
                value={minecraftUsername}
                onChange={(event) => setMinecraftUsername(event.target.value)}
              />
              <button
                className="secondary-button"
                disabled={
                  props.busy || !selectedDeviceMapping?.deviceId || minecraftUsername.length < 3
                }
                onClick={() => void updateMinecraftMapping()}
              >
                Save mapping
              </button>
            </div>
            <div className="button-row">
              <Link className="secondary-button" href="/" onClick={openWorkspace}>
                Edit selected blocks
              </Link>
              <button className="secondary-button" onClick={() => void pushWorkspace()}>
                Push my local blocks
              </button>
              <button className="primary-button" onClick={() => void queue("deploy_program")}>
                Run
              </button>
              <button className="danger-button" onClick={() => void queue("stop_program")}>
                Stop
              </button>
            </div>
            <CommandStatus
              commands={props.snapshot?.commands ?? []}
              workspaceId={selectedWorkspace.id}
            />
            {props.snapshot?.help
              .filter(
                (item) =>
                  item.camper_id === selectedWorkspace.camper_id && item.state !== "resolved",
              )
              .map((help) => (
                <div className="help-controls" key={help.id}>
                  <strong>{help.summary ?? "Student requested help."}</strong>
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      onClick={() =>
                        void props.perform(async () => {
                          await callClassroomApi("update_help", {
                            helpRequestId: help.id,
                            state: "acknowledged",
                          });
                          await props.refreshSnapshot();
                          return "Help request acknowledged.";
                        })
                      }
                    >
                      Acknowledge
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() =>
                        void props.perform(async () => {
                          await callClassroomApi("update_help", {
                            helpRequestId: help.id,
                            state: "resolved",
                          });
                          await props.refreshSnapshot();
                          return "Help request resolved.";
                        })
                      }
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ) : null}
        {props.snapshot?.hosts.map((host) => {
          const online =
            host.last_seen_at !== undefined && Date.now() - Date.parse(host.last_seen_at) < 20_000;
          return (
            <p className="host-health" key={host.id}>
              Host <strong>{host.display_name}</strong>: {online ? "online" : "offline"}
            </p>
          );
        })}
      </section>
    </div>
  );
}

function StudentWorkspace(props: {
  busy: boolean;
  student: StudentState;
  perform(work: () => Promise<string>): Promise<void>;
  refresh(): Promise<void>;
}) {
  const syncLocal = () =>
    props.perform(async () => {
      const binding = loadClassroomBinding();
      if (!binding || binding.workspaceId !== props.student.workspaceId) {
        throw new Error("Open your blocks first so the correct local workspace is selected.");
      }
      const result = await callClassroomApi<{
        result:
          | { kind: "saved"; revision: number }
          | { kind: "revision_conflict"; actual_revision: number };
      }>("save_program", {
        workspaceId: props.student.workspaceId,
        baseRevision: props.student.revision,
        clientMutationId: crypto.randomUUID(),
        program: localRunnableProgram(),
      });
      if (result.result.kind === "revision_conflict") {
        await props.refresh();
        throw new Error(
          `Someone saved revision ${result.result.actual_revision} first. Review the updated blocks before saving again.`,
        );
      }
      await props.refresh();
      return `Cloud autosave accepted revision ${result.result.revision}.`;
    });

  const queue = (commandKind: "deploy_program" | "stop_program") =>
    props.perform(async () => {
      const result = await callClassroomApi<{ commandId: string; status: string }>(
        "queue_runtime",
        {
          workspaceId: props.student.workspaceId,
          commandKind,
        },
      );
      return `${commandKind === "deploy_program" ? "Run" : "Stop"} command ${result.commandId} is ${result.status}.`;
    });

  const requestHelp = () =>
    props.perform(async () => {
      await callClassroomApi("request_help", {
        summary: "I need help with my Sheep City program.",
      });
      return "Your instructor can now see your help request.";
    });

  return (
    <section className="classroom-card student-workspace">
      <p className="eyebrow">Student workspace</p>
      <h2>{props.student.displayName}</h2>
      <div className="student-status-grid">
        <div>
          <small>Cloud revision</small>
          <strong>{props.student.revision}</strong>
        </div>
        <div>
          <small>Minecraft runtime</small>
          <strong>{props.student.activeRuntimeVersionId ? "Running" : "Stopped"}</strong>
        </div>
        <div>
          <small>Project</small>
          <strong>Sheep City</strong>
        </div>
      </div>
      <p>
        Load the cloud revision into the block editor. Valid block changes save locally immediately
        and can be synchronized here; the editor also performs a debounced cloud save while this
        workspace remains bound.
      </p>
      <div className="button-row">
        <Link
          className="primary-button"
          href="/"
          onClick={() =>
            bindWorkspace(
              {
                version: 1,
                workspaceId: props.student.workspaceId,
                revision: props.student.revision,
                role: "camper",
              },
              props.student.program,
            )
          }
        >
          Open my blocks
        </Link>
        <button className="secondary-button" disabled={props.busy} onClick={() => void syncLocal()}>
          Sync local blocks
        </button>
        <button
          className="primary-button"
          disabled={props.busy}
          onClick={() => void queue("deploy_program")}
        >
          Run
        </button>
        <button
          className="danger-button"
          disabled={props.busy}
          onClick={() => void queue("stop_program")}
        >
          Stop
        </button>
        <button
          className="secondary-button"
          disabled={props.busy}
          onClick={() => void requestHelp()}
        >
          Ask for help
        </button>
      </div>
    </section>
  );
}

function CommandStatus(props: { commands: ClassroomSnapshot["commands"]; workspaceId: string }) {
  const latest = props.commands.find((item) => item.workspace_id === props.workspaceId);
  if (!latest) return <p>No runtime command has been sent for this workspace.</p>;
  return (
    <p>
      Latest {latest.command_kind}: <strong>{latest.status}</strong>
      {latest.acknowledgement_code ? ` · ${latest.acknowledgement_code}` : ""}
    </p>
  );
}
