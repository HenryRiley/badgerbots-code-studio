import { createClient } from "npm:@supabase/supabase-js@2.110.8";
import {
  ClassroomApiError,
  createJoinCode,
  hmacHex,
  isRecord,
  nativeHostOnboardingActionAllowed,
  optionalString,
  requiredRevision,
  requiredString,
  sheepCityStarterProgram,
  validateCamperName,
  validateClassroomProgram,
  validateDateRange,
  validateMinecraftUsername,
  validateStableDevicePublicId,
} from "../_shared/classroom.ts";

const supabaseUrl = requiredEnvironment("SUPABASE_URL");
const serviceKey = serviceKeyFromEnvironment();
const publishableKey = publishableKeyFromEnvironment();
const credentialPepper = requiredEnvironment("BADGERBOTS_CREDENTIAL_PEPPER");
const allowedOrigins = new Set(
  (Deno.env.get("BADGERBOTS_WEB_ORIGINS") ??
    "http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:4173,http://localhost:4173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const admin = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

interface InstructorContext {
  authSubject: string;
  instructorId: string;
}

interface CamperContext {
  authSubject: string;
  camperId: string;
  sessionId: string;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") ?? "";
  const hostRequest = request.headers.has("x-badgerbots-host-id");
  const nativeHostOnboarding =
    request.headers.get("x-badgerbots-client") === "host-onboarding-v1";
  if (!hostRequest && !nativeHostOnboarding && !allowedOrigins.has(origin)) {
    return response(403, { error: "This Code Studio origin is not allowed." });
  }
  if (request.method === "OPTIONS") return preflight(origin);
  if (request.method !== "POST") {
    return response(
      405,
      { error: "Use POST for classroom API requests." },
      origin,
    );
  }

  try {
    const body = await readBody(request);
    const action = requiredString(body, "action", 64);
    if (nativeHostOnboarding && !nativeHostOnboardingActionAllowed(action)) {
      throw new ClassroomApiError(
        403,
        "forbidden",
        "Native Host onboarding cannot perform this classroom action.",
      );
    }
    const result = await route(action, body, request);
    return response(200, result, origin);
  } catch (error) {
    const known = error instanceof ClassroomApiError
      ? error
      : new ClassroomApiError(
        500,
        "request_failed",
        "The classroom request could not finish.",
      );
    return response(
      known.status,
      { code: known.code, error: known.message },
      origin,
    );
  }
});

async function route(
  action: string,
  body: Record<string, unknown>,
  request: Request,
): Promise<Record<string, unknown>> {
  switch (action) {
    case "profile":
      return instructorProfile(await requireInstructor(request));
    case "create_session":
      return createSession(await requireInstructor(request), body);
    case "provision_assistant":
      return provisionAssistant(await requireInstructor(request), body);
    case "list_sessions":
      return listSessions(await requireInstructor(request));
    case "session_snapshot":
      return sessionSnapshot(
        await requireInstructor(request),
        requiredString(body, "sessionId", 64),
      );
    case "set_device_mapping":
      return setDeviceMapping(await requireInstructor(request), body);
    case "join":
      return joinClassroom(body, request);
    case "workspace":
      return camperWorkspace(await requireCamper(request));
    case "save_program":
      return saveProgram(request, body);
    case "request_help":
      return requestHelp(await requireCamper(request), body);
    case "update_help":
      return updateHelp(await requireInstructor(request), body);
    case "pair_host":
      return pairHost(await requireInstructor(request), body);
    case "queue_runtime":
      return queueRuntime(request, body);
    case "host_poll":
      return hostPoll(request);
    case "host_routes":
      return hostRoutes(request);
    case "host_ack":
      return hostAcknowledge(request, body);
    default:
      throw new ClassroomApiError(
        404,
        "not_found",
        "Classroom action was not found.",
      );
  }
}

async function provisionAssistant(
  instructor: InstructorContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const organizationId = requiredString(body, "organizationId", 64);
  const email = requiredString(body, "email", 200);
  const password = requiredString(body, "temporaryPassword", 200);
  const sessionId = optionalString(body, "sessionId", 64);
  await requireOrganizationRole(
    instructor.instructorId,
    organizationId,
    "owner",
  );
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12) {
    throw new ClassroomApiError(
      400,
      "invalid_input",
      "Use a valid assistant email and a temporary password of at least 12 characters.",
    );
  }
  if (sessionId) await requireSessionOwner(instructor.instructorId, sessionId);
  const { data: created, error: createError } = await admin.auth.admin
    .createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { account_kind: "instructor" },
    });
  if (createError || !created.user) {
    throw new ClassroomApiError(
      409,
      "identity_exists",
      "That instructor account could not be provisioned. It may already exist.",
    );
  }
  const instructorId = crypto.randomUUID();
  try {
    const { error: instructorError } = await admin.from("instructors").insert({
      id: instructorId,
      auth_subject: created.user.id,
      normalized_email: email.trim().toLocaleLowerCase(),
      display_email: email.trim(),
    });
    if (instructorError) throw databaseError();
    const { error: membershipError } = await admin.from("memberships").insert({
      organization_id: organizationId,
      instructor_id: instructorId,
      role: "assistant",
    });
    if (membershipError) throw databaseError();
    if (sessionId) {
      const { error: assignmentError } = await admin
        .from("session_instructors")
        .insert({
          session_id: sessionId,
          instructor_id: instructorId,
          role: "assistant",
        });
      if (assignmentError) throw databaseError();
    }
    return { instructorId, assignedSessionId: sessionId ?? null };
  } catch (error) {
    await admin.from("session_instructors").delete().eq(
      "instructor_id",
      instructorId,
    );
    await admin.from("memberships").delete().eq("instructor_id", instructorId);
    await admin.from("instructors").delete().eq("id", instructorId);
    await admin.auth.admin.deleteUser(created.user.id);
    throw error;
  }
}

async function instructorProfile(
  context: InstructorContext,
): Promise<Record<string, unknown>> {
  const { data: memberships, error } = await admin
    .from("memberships")
    .select("organization_id, role")
    .eq("instructor_id", context.instructorId);
  if (error) throw databaseError();
  const organizationIds = (memberships ?? []).map((item) =>
    item.organization_id
  );
  if (organizationIds.length === 0) {
    return {
      instructorId: context.instructorId,
      memberships: [],
      organizations: [],
      locations: [],
    };
  }
  const [
    { data: organizations, error: organizationError },
    { data: locations, error: locationError },
  ] = await Promise.all([
    admin.from("organizations").select("id,name").in("id", organizationIds),
    admin.from("locations").select("id,organization_id,name").in(
      "organization_id",
      organizationIds,
    ),
  ]);
  if (organizationError || locationError) throw databaseError();
  return {
    instructorId: context.instructorId,
    memberships: memberships ?? [],
    organizations: organizations ?? [],
    locations: locations ?? [],
  };
}

async function createSession(
  instructor: InstructorContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const organizationId = requiredString(body, "organizationId", 64);
  const locationId = requiredString(body, "locationId", 64);
  const startsOn = requiredString(body, "startsOn", 10);
  const endsOn = requiredString(body, "endsOn", 10);
  const trackId = requiredString(body, "trackId", 64);
  validateDateRange(startsOn, endsOn);
  await requireOrganizationRole(
    instructor.instructorId,
    organizationId,
    "owner",
  );
  const { data: location, error: locationError } = await admin
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (locationError || !location) {
    throw new ClassroomApiError(404, "not_found", "Location was not found.");
  }

  const random = crypto.getRandomValues(new Uint8Array(8));
  const joinCode = createJoinCode(random);
  const joinCodeDigest = await hmacHex(credentialPepper, joinCode);
  const today = new Date().toISOString().slice(0, 10);
  if (endsOn < today) {
    throw new ClassroomApiError(
      400,
      "invalid_input",
      "The session end date cannot be in the past.",
    );
  }
  const sessionId = crypto.randomUUID();
  const { error } = await admin.from("sessions").insert({
    id: sessionId,
    organization_id: organizationId,
    location_id: locationId,
    owner_instructor_id: instructor.instructorId,
    track_id: trackId,
    starts_on: startsOn,
    ends_on: endsOn,
    join_code_digest: joinCodeDigest,
    retention_state: today < startsOn ? "scheduled" : "active",
  });
  if (error) throw databaseError();
  const { error: assignmentError } = await admin.from("session_instructors")
    .insert({
      session_id: sessionId,
      instructor_id: instructor.instructorId,
      role: "owner",
    });
  if (assignmentError) {
    await admin.from("sessions").delete().eq("id", sessionId);
    throw databaseError();
  }
  await audit({
    organizationId,
    sessionId,
    actorKind: "instructor",
    actorId: instructor.instructorId,
    action: "session.create",
    targetKind: "session",
    targetId: sessionId,
  });
  return { sessionId, joinCode };
}

async function listSessions(
  instructor: InstructorContext,
): Promise<Record<string, unknown>> {
  const { data: assignments, error: assignmentError } = await admin
    .from("session_instructors")
    .select("session_id")
    .eq("instructor_id", instructor.instructorId);
  if (assignmentError) throw databaseError();
  const ids = (assignments ?? []).map((item) => item.session_id);
  if (ids.length === 0) return { sessions: [] };
  const { data, error } = await admin
    .from("sessions")
    .select(
      "id,location_id,track_id,starts_on,ends_on,retention_state,created_at",
    )
    .in("id", ids)
    .order("starts_on", { ascending: false });
  if (error) throw databaseError();
  return { sessions: data ?? [] };
}

async function sessionSnapshot(
  instructor: InstructorContext,
  sessionId: string,
): Promise<Record<string, unknown>> {
  await requireSessionInstructor(instructor.instructorId, sessionId);
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select(
      "id,organization_id,location_id,track_id,starts_on,ends_on,retention_state",
    )
    .eq("id", sessionId)
    .single();
  if (sessionError) throw databaseError();
  const { data: campers, error: campersError } = await admin
    .from("campers")
    .select("id,first_name,last_initial,created_at")
    .eq("session_id", sessionId)
    .is("hidden_at", null)
    .order("created_at");
  if (campersError) throw databaseError();
  const { data: workspaces, error: workspaceError } = await admin
    .from("project_workspaces")
    .select(
      "id,camper_id,project_key,revision,canonical_program,active_runtime_version_id,updated_at",
    )
    .eq("session_id", sessionId);
  if (workspaceError) throw databaseError();
  const { data: help, error: helpError } = await admin
    .from("help_requests")
    .select("id,camper_id,state,summary,created_at")
    .eq("session_id", sessionId)
    .neq("state", "resolved");
  if (helpError) throw databaseError();
  const { data: commands, error: commandError } = await admin
    .from("classroom_commands")
    .select(
      "id,workspace_id,command_kind,status,acknowledgement_code,issued_at",
    )
    .eq("session_id", sessionId)
    .order("issued_at", { ascending: false })
    .limit(50);
  if (commandError) throw databaseError();
  const { data: health, error: healthError } = await admin
    .from("connection_health")
    .select("subject_kind,subject_id,state,observed_at")
    .eq("session_id", sessionId);
  if (healthError) throw databaseError();
  const { data: hosts, error: hostError } = await admin
    .from("host_installations")
    .select("id,display_name,last_seen_at")
    .eq("location_id", session.location_id);
  if (hostError) throw databaseError();
  const { data: enrollments, error: enrollmentError } = await admin
    .from("enrollments")
    .select("camper_id,device_id")
    .eq("session_id", sessionId)
    .is("revoked_at", null);
  if (enrollmentError) throw databaseError();
  const deviceIds = (enrollments ?? [])
    .map((item) => item.device_id)
    .filter((value): value is string => typeof value === "string");
  const { data: devices, error: deviceError } = deviceIds.length
    ? await admin
      .from("devices")
      .select("id,stable_device_public_id")
      .in("id", deviceIds)
    : { data: [], error: null };
  if (deviceError) throw databaseError();
  const { data: mappings, error: mappingError } = deviceIds.length
    ? await admin
      .from("minecraft_mappings")
      .select("device_id,minecraft_username")
      .in("device_id", deviceIds)
      .eq("active", true)
    : { data: [], error: null };
  if (mappingError) throw databaseError();
  const devicesById = new Map(
    (devices ?? []).map((item) => [item.id, item.stable_device_public_id]),
  );
  const usernamesByDevice = new Map(
    (mappings ?? []).map((item) => [item.device_id, item.minecraft_username]),
  );
  return {
    session,
    campers: campers ?? [],
    workspaces: workspaces ?? [],
    help: help ?? [],
    commands: commands ?? [],
    health: health ?? [],
    hosts: hosts ?? [],
    deviceMappings: (enrollments ?? []).map((item) => ({
      camperId: item.camper_id,
      deviceId: item.device_id,
      devicePublicId: item.device_id
        ? devicesById.get(item.device_id) ?? null
        : null,
      minecraftUsername: item.device_id
        ? usernamesByDevice.get(item.device_id) ?? null
        : null,
    })),
  };
}

async function setDeviceMapping(
  instructor: InstructorContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sessionId = requiredString(body, "sessionId", 64);
  const camperId = requiredString(body, "camperId", 64);
  const minecraftUsername = validateMinecraftUsername(
    requiredString(body, "minecraftUsername", 16),
  );
  await requireSessionInstructor(instructor.instructorId, sessionId);
  const { data: mappingRows, error: mappingError } = await admin.rpc(
    "set_session_device_minecraft_mapping",
    {
      requested_session_id: sessionId,
      requested_camper_id: camperId,
      acting_instructor_id: instructor.instructorId,
      requested_minecraft_username: minecraftUsername,
    },
  );
  if (mappingError || !Array.isArray(mappingRows) || mappingRows.length !== 1) {
    throw new ClassroomApiError(
      409,
      "device_required",
      "Ask the camper to open Code Studio from BadgerBots Connect and join again.",
    );
  }
  const mapping = mappingRows[0] as {
    mapped_device_id: string;
    mapping_organization_id: string;
  };
  await audit({
    organizationId: mapping.mapping_organization_id,
    sessionId,
    actorKind: "instructor",
    actorId: instructor.instructorId,
    action: "device.minecraft_mapping.update",
    targetKind: "device",
    targetId: mapping.mapped_device_id,
  });
  return {
    deviceId: mapping.mapped_device_id,
    minecraftUsername,
  };
}

async function joinClassroom(
  body: Record<string, unknown>,
  request: Request,
): Promise<Record<string, unknown>> {
  const joinCode = requiredString(body, "joinCode", 16).toUpperCase();
  const { firstName, lastInitial } = validateCamperName(
    requiredString(body, "firstName", 40),
    requiredString(body, "lastInitial", 2),
  );
  const devicePublicId = body.devicePublicId === undefined
    ? undefined
    : validateStableDevicePublicId(body.devicePublicId);
  const attemptDigest = await hmacHex(credentialPepper, abuseKey(request));
  const { data: attempt } = await admin
    .from("join_attempt_windows")
    .select("blocked_until")
    .eq("key_digest", attemptDigest)
    .maybeSingle();
  if (
    attempt?.blocked_until &&
    new Date(String(attempt.blocked_until)).getTime() > Date.now()
  ) {
    throw joinDenied();
  }

  const digest = await hmacHex(credentialPepper, joinCode);
  const { data: session } = await admin
    .from("sessions")
    .select("id,organization_id,location_id,starts_on,ends_on,retention_state")
    .eq("join_code_digest", digest)
    .maybeSingle();
  const today = new Date().toISOString().slice(0, 10);
  if (
    !session ||
    session.retention_state !== "active" ||
    today < String(session.starts_on) ||
    today > String(session.ends_on)
  ) {
    await admin.rpc("record_failed_classroom_join", {
      attempt_key_digest: attemptDigest,
      attempt_limit: 5,
    });
    throw joinDenied();
  }
  await admin.from("join_attempt_windows").delete().eq(
    "key_digest",
    attemptDigest,
  );

  const identitySeed = crypto.randomUUID();
  const syntheticEmail = `camper-${identitySeed}@access.badgerbots.invalid`;
  const syntheticPassword = randomToken(48);
  const { data: created, error: createError } = await admin.auth.admin
    .createUser({
      email: syntheticEmail,
      password: syntheticPassword,
      email_confirm: true,
      user_metadata: { account_kind: "temporary_camper" },
    });
  if (createError || !created.user) {
    throw new ClassroomApiError(
      503,
      "identity_unavailable",
      "Student access is temporarily unavailable.",
    );
  }
  const authSubject = created.user.id;
  const camperId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  let deviceId: string | undefined;
  try {
    if (devicePublicId) {
      const { data: device, error: deviceError } = await admin
        .from("devices")
        .upsert(
          {
            organization_id: session.organization_id,
            stable_device_public_id: devicePublicId,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,stable_device_public_id" },
        )
        .select("id")
        .single();
      if (deviceError) throw databaseError();
      deviceId = device.id;
    }
    const { error: camperError } = await admin.from("campers").insert({
      id: camperId,
      session_id: session.id,
      first_name: firstName,
      last_initial: lastInitial,
      auth_subject: authSubject,
      access_credential_digest: await hmacHex(
        credentialPepper,
        randomToken(32),
      ),
    });
    if (camperError) throw databaseError();
    const { error: enrollmentError } = await admin.from("enrollments").insert({
      session_id: session.id,
      camper_id: camperId,
      ...(deviceId ? { device_id: deviceId } : {}),
    });
    if (enrollmentError) throw databaseError();
    const { error: workspaceError } = await admin.from("project_workspaces")
      .insert({
        id: workspaceId,
        organization_id: session.organization_id,
        session_id: session.id,
        camper_id: camperId,
        project_key: "sheep-city",
        revision: 0,
        canonical_program: sheepCityStarterProgram,
      });
    if (workspaceError) throw databaseError();
    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data: signIn, error: signInError } = await authClient.auth
      .signInWithPassword({
        email: syntheticEmail,
        password: syntheticPassword,
      });
    if (signInError || !signIn.session) throw databaseError();
    await audit({
      organizationId: session.organization_id,
      sessionId: session.id,
      actorKind: "camper",
      actorId: camperId,
      action: "camper.join",
      targetKind: "camper",
      targetId: camperId,
    });
    return {
      sessionId: session.id,
      organizationId: session.organization_id,
      camperId,
      deviceId,
      workspaceId,
      displayName: `${firstName} ${lastInitial}.`,
      accessToken: signIn.session.access_token,
      refreshToken: signIn.session.refresh_token,
      expiresAt: signIn.session.expires_at,
      program: sheepCityStarterProgram,
      revision: 0,
    };
  } catch (error) {
    await admin.from("project_workspaces").delete().eq("id", workspaceId);
    await admin.from("enrollments").delete().eq("camper_id", camperId);
    await admin.from("campers").delete().eq("id", camperId);
    await admin.auth.admin.deleteUser(authSubject);
    throw error;
  }
}

async function camperWorkspace(
  camper: CamperContext,
): Promise<Record<string, unknown>> {
  await assertSessionActive(camper.sessionId);
  const { data, error } = await admin
    .from("project_workspaces")
    .select(
      "id,organization_id,session_id,camper_id,revision,canonical_program,active_runtime_version_id,updated_at",
    )
    .eq("camper_id", camper.camperId)
    .eq("session_id", camper.sessionId)
    .single();
  if (error) throw databaseError();
  return { workspace: data };
}

async function saveProgram(
  request: Request,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const workspaceId = requiredString(body, "workspaceId", 64);
  const baseRevision = requiredRevision(body);
  const mutationId = requiredString(body, "clientMutationId", 64);
  const program = validateClassroomProgram(body.program);
  const actor = await requireWorkspaceActor(request, workspaceId);
  const versionId = crypto.randomUUID();
  const { data, error } = await admin.rpc("save_program_version_v2", {
    target_workspace_id: workspaceId,
    expected_revision: baseRevision,
    next_program: program,
    created_version_id: versionId,
    version_author_kind: actor.kind,
    version_author_id: actor.id,
    mutation_id: mutationId,
  });
  if (error) throw databaseError();
  return { result: data };
}

async function requestHelp(
  camper: CamperContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await assertSessionActive(camper.sessionId);
  const summary = optionalString(body, "summary", 240);
  const { data: existing, error: existingError } = await admin
    .from("help_requests")
    .select("id,state,summary,created_at")
    .eq("camper_id", camper.camperId)
    .neq("state", "resolved")
    .maybeSingle();
  if (existingError) throw databaseError();
  if (existing) return { helpRequest: existing };
  const { data, error } = await admin
    .from("help_requests")
    .insert({
      session_id: camper.sessionId,
      camper_id: camper.camperId,
      ...(summary ? { summary } : {}),
    })
    .select("id,state,summary,created_at")
    .single();
  if (error) throw databaseError();
  return { helpRequest: data };
}

async function updateHelp(
  instructor: InstructorContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const helpRequestId = requiredString(body, "helpRequestId", 64);
  const state = requiredString(body, "state", 20);
  if (!["acknowledged", "resolved"].includes(state)) {
    throw new ClassroomApiError(
      400,
      "invalid_input",
      "Help requests can be acknowledged or resolved.",
    );
  }
  const { data: request, error: requestError } = await admin
    .from("help_requests")
    .select("id,session_id")
    .eq("id", helpRequestId)
    .single();
  if (requestError) throw databaseError();
  await requireSessionInstructor(instructor.instructorId, request.session_id);
  const { data, error } = await admin
    .from("help_requests")
    .update({
      state,
      acknowledged_by_instructor_id: instructor.instructorId,
      resolved_at: state === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", helpRequestId)
    .select("id,state")
    .single();
  if (error) throw databaseError();
  return { helpRequest: data };
}

async function pairHost(
  instructor: InstructorContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const organizationId = requiredString(body, "organizationId", 64);
  const locationId = requiredString(body, "locationId", 64);
  const displayName = requiredString(body, "displayName", 120);
  await requireOrganizationRole(
    instructor.instructorId,
    organizationId,
    "owner",
  );
  const { data: location, error: locationError } = await admin
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (locationError || !location) {
    throw new ClassroomApiError(404, "not_found", "Location was not found.");
  }
  const token = randomToken(32);
  const hostId = crypto.randomUUID();
  const { error } = await admin.from("host_installations").insert({
    id: hostId,
    organization_id: organizationId,
    location_id: locationId,
    display_name: displayName,
    pairing_credential_digest: await hmacHex(credentialPepper, token),
    credential_rotated_at: new Date().toISOString(),
  });
  if (error) throw databaseError();
  return { hostId, pairingToken: token };
}

async function queueRuntime(
  request: Request,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const workspaceId = requiredString(body, "workspaceId", 64);
  const commandKind = requiredString(body, "commandKind", 32);
  if (!["deploy_program", "stop_program"].includes(commandKind)) {
    throw new ClassroomApiError(
      400,
      "invalid_input",
      "Unsupported runtime command.",
    );
  }
  const actor = await requireWorkspaceActor(request, workspaceId);
  const { data: workspace, error: workspaceError } = await admin
    .from("project_workspaces")
    .select(
      "id,organization_id,session_id,camper_id,project_key,revision,canonical_program,active_runtime_version_id,sessions(location_id)",
    )
    .eq("id", workspaceId)
    .single();
  if (workspaceError) throw databaseError();
  await assertSessionActive(workspace.session_id);
  const locationId = nestedId(workspace.sessions, "location_id");
  const { data: host, error: hostError } = await admin
    .from("host_installations")
    .select("id")
    .eq("organization_id", workspace.organization_id)
    .eq("location_id", locationId)
    .not("pairing_credential_digest", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (hostError || !host) {
    throw new ClassroomApiError(
      409,
      "host_offline",
      "No paired Host is available for this location.",
    );
  }
  const { data: sequence, error: sequenceError } = await admin.rpc(
    "next_classroom_command_sequence",
    { target_host_id: host.id },
  );
  if (sequenceError) throw databaseError();
  const latestVersion = commandKind === "deploy_program"
    ? await latestProgramVersion(workspaceId, Number(workspace.revision))
    : undefined;
  const { data: enrollment, error: enrollmentError } = await admin
    .from("enrollments")
    .select("device_id")
    .eq("session_id", workspace.session_id)
    .eq("camper_id", workspace.camper_id)
    .is("revoked_at", null)
    .maybeSingle();
  if (enrollmentError) throw databaseError();
  if (!enrollment?.device_id) {
    throw new ClassroomApiError(
      409,
      "device_required",
      "Open this camper’s coding console from BadgerBots Connect before Run.",
    );
  }
  const { data: mapping, error: mappingError } = await admin
    .from("minecraft_mappings")
    .select("minecraft_username")
    .eq("organization_id", workspace.organization_id)
    .eq("device_id", enrollment.device_id)
    .eq("active", true)
    .maybeSingle();
  if (mappingError) throw databaseError();
  if (!mapping) {
    throw new ClassroomApiError(
      409,
      "minecraft_mapping_required",
      "An instructor must assign this device’s exact Minecraft username before Run.",
    );
  }
  const commandId = crypto.randomUUID();
  const now = Date.now();
  const payload = commandKind === "deploy_program"
    ? {
      programVersionId: latestVersion?.id,
      program: validateClassroomProgram(workspace.canonical_program),
      camperId: workspace.camper_id,
      projectId: workspace.project_key,
      minecraftUsername: mapping.minecraft_username,
      expectedActiveVersionId: workspace.active_runtime_version_id,
    }
    : {
      reason: actor.kind,
      camperId: workspace.camper_id,
      projectId: workspace.project_key,
      minecraftUsername: mapping.minecraft_username,
    };
  const { error } = await admin.from("classroom_commands").insert({
    id: commandId,
    organization_id: workspace.organization_id,
    location_id: locationId,
    session_id: workspace.session_id,
    host_installation_id: host.id,
    workspace_id: workspaceId,
    sequence,
    command_kind: commandKind,
    command_payload: payload,
    created_by_kind: actor.kind,
    created_by_id: actor.id,
    correlation_id: crypto.randomUUID(),
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + 120_000).toISOString(),
  });
  if (error) throw databaseError();
  return { commandId, status: "pending" };
}

async function hostPoll(request: Request): Promise<Record<string, unknown>> {
  const host = await requireHost(request);
  const { data, error } = await admin.rpc("claim_next_classroom_command", {
    target_host_id: host.hostId,
  });
  if (error) throw databaseError();
  const command = Array.isArray(data) ? data[0] : undefined;
  if (!command) return { command: null };
  const delivery = {
    id: command.id,
    organizationId: command.organization_id,
    locationId: command.location_id,
    sessionId: command.session_id,
    workspaceId: command.workspace_id,
    sequence: Number(command.sequence),
    kind: command.command_kind,
    payload: command.command_payload,
    issuedAt: command.issued_at,
    expiresAt: command.expires_at,
  };
  return {
    command: delivery,
    signature: await hmacHex(host.token, JSON.stringify(delivery)),
  };
}

async function hostRoutes(request: Request): Promise<Record<string, unknown>> {
  const host = await requireHost(request);
  const today = new Date().toISOString().slice(0, 10);
  const { data: sessions, error: sessionError } = await admin
    .from("sessions")
    .select("id")
    .eq("organization_id", host.organizationId)
    .eq("location_id", host.locationId)
    .eq("retention_state", "active")
    .lte("starts_on", today)
    .gte("ends_on", today);
  if (sessionError) throw databaseError();
  const sessionIds = (sessions ?? []).map((session) => session.id);
  if (sessionIds.length === 0) {
    const routes = { schemaVersion: 1, entries: [] };
    return {
      routes,
      signature: await hmacHex(host.token, JSON.stringify(routes)),
    };
  }
  const { data: enrollments, error: enrollmentError } = await admin
    .from("enrollments")
    .select("session_id,camper_id,device_id")
    .in("session_id", sessionIds)
    .is("revoked_at", null)
    .not("device_id", "is", null);
  if (enrollmentError) throw databaseError();
  const deviceIds = (enrollments ?? [])
    .map((item) => item.device_id)
    .filter((value): value is string => typeof value === "string");
  const { data: mappings, error: mappingError } = deviceIds.length
    ? await admin
      .from("minecraft_mappings")
      .select("device_id,minecraft_username")
      .eq("organization_id", host.organizationId)
      .in("device_id", deviceIds)
      .eq("active", true)
    : { data: [], error: null };
  if (mappingError) throw databaseError();
  const usernames = new Map(
    (mappings ?? []).map((item) => [item.device_id, item.minecraft_username]),
  );
  const entries = (enrollments ?? [])
    .flatMap((enrollment) => {
      const minecraftUsername = usernames.get(enrollment.device_id);
      return minecraftUsername
        ? [{
          organizationId: host.organizationId,
          locationId: host.locationId,
          sessionId: enrollment.session_id,
          camperId: enrollment.camper_id,
          projectId: "sheep-city",
          minecraftUsername,
        }]
        : [];
    })
    .sort((left, right) =>
      left.minecraftUsername.toLowerCase().localeCompare(
        right.minecraftUsername.toLowerCase(),
      )
    );
  const routes = { schemaVersion: 1, entries };
  return {
    routes,
    signature: await hmacHex(host.token, JSON.stringify(routes)),
  };
}

async function hostAcknowledge(
  request: Request,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const host = await requireHost(request);
  const commandId = requiredString(body, "commandId", 64);
  const status = requiredString(body, "status", 16);
  if (!["accepted", "rejected"].includes(status)) {
    throw new ClassroomApiError(
      400,
      "invalid_input",
      "Host acknowledgement status is invalid.",
    );
  }
  const code = optionalString(body, "code", 120);
  const activeRuntimeVersionId = optionalString(
    body,
    "activeRuntimeVersionId",
    64,
  );
  const acknowledgement = {
    commandId,
    status,
    ...(code ? { code } : {}),
    ...(activeRuntimeVersionId ? { activeRuntimeVersionId } : {}),
  };
  const signature = requiredString(body, "signature", 64);
  if (
    !secureEqual(
      await hmacHex(host.token, JSON.stringify(acknowledgement)),
      signature,
    )
  ) {
    throw new ClassroomApiError(
      401,
      "host_denied",
      "Host acknowledgement signature was rejected.",
    );
  }
  const { data: command, error: commandError } = await admin
    .from("classroom_commands")
    .select("id,workspace_id")
    .eq("id", commandId)
    .eq("host_installation_id", host.hostId)
    .single();
  if (commandError) throw databaseError();
  const { error } = await admin
    .from("classroom_commands")
    .update({
      status,
      acknowledged_at: new Date().toISOString(),
      acknowledgement_code: code ?? null,
      active_runtime_version_id: activeRuntimeVersionId ?? null,
    })
    .eq("id", commandId)
    .eq("host_installation_id", host.hostId);
  if (error) throw databaseError();
  if (status === "accepted") {
    await admin
      .from("project_workspaces")
      .update({ active_runtime_version_id: activeRuntimeVersionId ?? null })
      .eq("id", command.workspace_id);
  }
  await admin
    .from("host_installations")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", host.hostId);
  return { acknowledged: true };
}

async function requireInstructor(request: Request): Promise<InstructorContext> {
  const user = await authenticatedUser(request);
  const authSubject = user.id;
  const { data, error } = await admin
    .from("instructors")
    .select("id")
    .eq("auth_subject", authSubject)
    .maybeSingle();
  if (error) throw databaseError();
  if (data) return { authSubject, instructorId: data.id };

  const confirmedEmail = user.email_confirmed_at ? user.email : undefined;
  if (!confirmedEmail) {
    throw new ClassroomApiError(
      403,
      "forbidden",
      "Instructor access was not found.",
    );
  }
  const { data: recoveredInstructorId, error: recoveryError } = await admin.rpc(
    "rebind_deleted_instructor_identity",
    {
      next_auth_subject: authSubject,
      confirmed_email: confirmedEmail,
    },
  );
  if (
    recoveryError || typeof recoveredInstructorId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(recoveredInstructorId)
  ) {
    throw new ClassroomApiError(
      403,
      "instructor_identity_mismatch",
      "This authenticated account is not linked to an instructor profile. If the Auth account was recreated, deploy the instructor identity recovery migration or ask an owner to restore the original account.",
    );
  }
  return { authSubject, instructorId: recoveredInstructorId };
}

async function requireCamper(request: Request): Promise<CamperContext> {
  const authSubject = await authenticatedSubject(request);
  const { data, error } = await admin
    .from("campers")
    .select("id,session_id,hidden_at")
    .eq("auth_subject", authSubject)
    .maybeSingle();
  if (error || !data || data.hidden_at) {
    throw new ClassroomApiError(
      403,
      "forbidden",
      "Student access was not found.",
    );
  }
  await assertSessionActive(data.session_id);
  return { authSubject, camperId: data.id, sessionId: data.session_id };
}

async function requireWorkspaceActor(
  request: Request,
  workspaceId: string,
): Promise<{ kind: "camper" | "instructor"; id: string }> {
  const authSubject = await authenticatedSubject(request);
  const { data: camper } = await admin
    .from("campers")
    .select("id,session_id")
    .eq("auth_subject", authSubject)
    .maybeSingle();
  if (camper) {
    const { data: workspace } = await admin
      .from("project_workspaces")
      .select("id")
      .eq("id", workspaceId)
      .eq("camper_id", camper.id)
      .eq("session_id", camper.session_id)
      .maybeSingle();
    if (!workspace) {
      throw new ClassroomApiError(
        403,
        "forbidden",
        "This is not your project workspace.",
      );
    }
    await assertSessionActive(camper.session_id);
    return { kind: "camper", id: camper.id };
  }
  const instructor = await requireInstructor(request);
  const { data: workspace, error } = await admin
    .from("project_workspaces")
    .select("session_id")
    .eq("id", workspaceId)
    .single();
  if (error) throw databaseError();
  await requireSessionInstructor(instructor.instructorId, workspace.session_id);
  await assertSessionActive(workspace.session_id);
  return { kind: "instructor", id: instructor.instructorId };
}

async function requireOrganizationRole(
  instructorId: string,
  organizationId: string,
  role: "owner" | "assistant",
): Promise<void> {
  const { data, error } = await admin
    .from("memberships")
    .select("role")
    .eq("instructor_id", instructorId)
    .eq("organization_id", organizationId)
    .eq("role", role)
    .maybeSingle();
  if (error || !data) {
    throw new ClassroomApiError(
      403,
      "forbidden",
      `This action requires the ${role} role.`,
    );
  }
}

async function requireSessionInstructor(
  instructorId: string,
  sessionId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("session_instructors")
    .select("role")
    .eq("instructor_id", instructorId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error || !data) {
    throw new ClassroomApiError(
      403,
      "forbidden",
      "Instructor is not assigned to this session.",
    );
  }
}

async function requireSessionOwner(
  instructorId: string,
  sessionId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("owner_instructor_id", instructorId)
    .maybeSingle();
  if (error || !data) {
    throw new ClassroomApiError(
      403,
      "forbidden",
      "This action requires the session owner.",
    );
  }
}

async function assertSessionActive(sessionId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("sessions")
    .select("retention_state,starts_on,ends_on")
    .eq("id", sessionId)
    .single();
  if (
    error ||
    data.retention_state !== "active" ||
    today < String(data.starts_on) ||
    today > String(data.ends_on)
  ) {
    throw new ClassroomApiError(
      403,
      "session_expired",
      "This camp session is not open for classroom changes.",
    );
  }
}

async function authenticatedSubject(request: Request): Promise<string> {
  return (await authenticatedUser(request)).id;
}

async function authenticatedUser(request: Request) {
  const token = bearerToken(request);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    throw new ClassroomApiError(
      401,
      "unauthorized",
      "Sign in again to continue.",
    );
  }
  return data.user;
}

async function requireHost(
  request: Request,
): Promise<{
  hostId: string;
  token: string;
  organizationId: string;
  locationId: string;
}> {
  const hostId = request.headers.get("x-badgerbots-host-id") ?? "";
  const token = request.headers.get("x-badgerbots-host-token") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(hostId) || token.length < 43) {
    throw new ClassroomApiError(
      401,
      "host_denied",
      "Host credentials are missing.",
    );
  }
  const digest = await hmacHex(credentialPepper, token);
  const { data, error } = await admin
    .from("host_installations")
    .select("id,organization_id,location_id")
    .eq("id", hostId)
    .eq("pairing_credential_digest", digest)
    .maybeSingle();
  if (error || !data) {
    throw new ClassroomApiError(
      401,
      "host_denied",
      "Host credentials were rejected.",
    );
  }
  await admin
    .from("host_installations")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", hostId);
  return {
    hostId,
    token,
    organizationId: data.organization_id,
    locationId: data.location_id,
  };
}

async function latestProgramVersion(workspaceId: string, revision: number) {
  if (revision < 1) {
    throw new ClassroomApiError(
      409,
      "save_required",
      "Save a valid program before Run.",
    );
  }
  const { data, error } = await admin
    .from("program_versions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("revision", revision)
    .single();
  if (error) throw databaseError();
  return data;
}

async function audit(input: {
  organizationId: string;
  sessionId: string;
  actorKind: "instructor" | "camper";
  actorId: string;
  action: string;
  targetKind: string;
  targetId: string;
}): Promise<void> {
  await admin.from("audit_records").insert({
    organization_id: input.organizationId,
    session_id: input.sessionId,
    actor_kind: input.actorKind,
    actor_id: input.actorId,
    action: input.action,
    target_kind: input.targetKind,
    target_id: input.targetId,
    correlation_id: crypto.randomUUID(),
  });
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 4096) {
    throw new ClassroomApiError(401, "unauthorized", "Sign in to continue.");
  }
  return authorization.slice("Bearer ".length);
}

function abuseKey(request: Request): string {
  const forwarded =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const agent = request.headers.get("user-agent")?.slice(0, 120) ?? "unknown";
  return `${forwarded}|${agent}`;
}

function nestedId(value: unknown, key: string): string {
  const row = Array.isArray(value) ? value[0] : value;
  if (!isRecord(row) || typeof row[key] !== "string") throw databaseError();
  return row[key];
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 512 * 1024) {
    throw new ClassroomApiError(
      413,
      "too_large",
      "Request exceeds the 512 KB limit.",
    );
  }
  const parsed: unknown = await request.json();
  if (!isRecord(parsed)) {
    throw new ClassroomApiError(
      400,
      "invalid_input",
      "Request must be a JSON object.",
    );
  }
  return parsed;
}

function randomToken(bytes: number): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll(
    "=",
    "",
  );
}

function joinDenied(): ClassroomApiError {
  return new ClassroomApiError(
    403,
    "join_denied",
    "That class code is not active. Check it with your instructor.",
  );
}

function databaseError(): ClassroomApiError {
  return new ClassroomApiError(
    503,
    "database_unavailable",
    "The classroom service is temporarily unavailable.",
  );
}

function response(status: number, body: unknown, origin?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...(origin
        ? { "access-control-allow-origin": origin, vary: "origin" }
        : {}),
    },
  });
}

function preflight(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers":
        "authorization, apikey, content-type, x-badgerbots-client, x-badgerbots-host-id, x-badgerbots-host-token",
      "access-control-max-age": "600",
      vary: "origin",
    },
  });
}

function requiredEnvironment(key: string): string {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function serviceKeyFromEnvironment(): string {
  const direct = Deno.env.get("BADGERBOTS_SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  return firstKey(requiredEnvironment("SUPABASE_SECRET_KEYS"));
}

function publishableKeyFromEnvironment(): string {
  const direct = Deno.env.get("BADGERBOTS_SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");
  if (direct) return direct;
  return firstKey(requiredEnvironment("SUPABASE_PUBLISHABLE_KEYS"));
}

function firstKey(value: string): string {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) throw new Error("Supabase key dictionary is invalid.");
  const key = Object.values(parsed).find((candidate) =>
    typeof candidate === "string"
  );
  if (typeof key !== "string") {
    throw new Error("Supabase key dictionary is empty.");
  }
  return key;
}

function secureEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
