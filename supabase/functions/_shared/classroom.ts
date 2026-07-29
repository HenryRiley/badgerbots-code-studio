export const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export interface ClassroomProgram {
  schemaVersion: 2;
  programId: string;
  projectId: "sheep-city";
  scripts: ClassroomScript[];
}

interface ClassroomScript {
  id: string;
  nodeType: "script";
  scriptKind: "player" | "game" | "sheep";
  displayName: "Player" | "Game" | "Sheep";
  body: ClassroomEvent[];
}

interface ClassroomEvent {
  id: string;
  nodeType:
    | "projectile_hit_event"
    | "player_move_event"
    | "sheep_spawn_event"
    | "sheep_death_event";
  body: ClassroomStatement[];
}

type ClassroomStatement =
  | { id: string; nodeType: "explode_at_hit"; power: number }
  | { id: string; nodeType: "bounce_player"; verticalVelocity: number }
  | {
    id: string;
    nodeType: "if_then";
    condition: {
      id: string;
      nodeType: "equals";
      left:
        | { id: string; nodeType: "get_material_under_player" }
        | { id: string; nodeType: "material_literal"; material: "GOLD_BLOCK" };
      right:
        | { id: string; nodeType: "get_material_under_player" }
        | { id: string; nodeType: "material_literal"; material: "GOLD_BLOCK" };
    };
    then: ClassroomStatement[];
  }
  | { id: string; nodeType: "set_sheep_color"; color: "RED" }
  | { id: string; nodeType: "set_sheep_speed"; multiplier: number }
  | { id: string; nodeType: "drop_item"; item: "GOLD_INGOT"; quantity: number };

export const sheepCityStarterProgram: ClassroomProgram = {
  schemaVersion: 2,
  programId: "sheep-city-starter",
  projectId: "sheep-city",
  scripts: [
    {
      id: "script-player",
      nodeType: "script",
      scriptKind: "player",
      displayName: "Player",
      body: [
        {
          id: "event-projectile-hit",
          nodeType: "projectile_hit_event",
          body: [],
        },
        { id: "event-player-move", nodeType: "player_move_event", body: [] },
      ],
    },
    {
      id: "script-game",
      nodeType: "script",
      scriptKind: "game",
      displayName: "Game",
      body: [],
    },
    {
      id: "script-sheep",
      nodeType: "script",
      scriptKind: "sheep",
      displayName: "Sheep",
      body: [
        { id: "event-sheep-spawn", nodeType: "sheep_spawn_event", body: [] },
        { id: "event-sheep-death", nodeType: "sheep_death_event", body: [] },
      ],
    },
  ],
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(
  record: Record<string, unknown>,
  key: string,
  maximum = 200,
): string {
  const value = record[key];
  if (
    typeof value !== "string" || value.trim().length === 0 ||
    value.length > maximum
  ) {
    throw new ClassroomApiError(400, "invalid_input", `${key} is invalid.`);
  }
  return value.trim();
}

export function optionalString(
  record: Record<string, unknown>,
  key: string,
  maximum = 200,
): string | undefined {
  const value = record[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > maximum) {
    throw new ClassroomApiError(400, "invalid_input", `${key} is invalid.`);
  }
  return value.trim();
}

export function requiredRevision(record: Record<string, unknown>): number {
  const value = record.baseRevision;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ClassroomApiError(
      400,
      "invalid_input",
      "baseRevision must be non-negative.",
    );
  }
  return value as number;
}

export function validateCamperName(
  firstNameInput: string,
  lastInitialInput: string,
) {
  const firstName = firstNameInput.trim();
  const lastInitial = lastInitialInput.trim().toLocaleUpperCase();
  if (
    !/^[\p{L}][\p{L}' -]{0,39}$/u.test(firstName) ||
    !/^\p{L}$/u.test(lastInitial)
  ) {
    throw new ClassroomApiError(
      400,
      "invalid_input",
      "Enter a first name and one-letter last initial.",
    );
  }
  return { firstName, lastInitial };
}

export function validateStableDevicePublicId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  ) {
    throw new ClassroomApiError(
      400,
      "invalid_device",
      "Open Code Studio from BadgerBots Connect on this student device.",
    );
  }
  return value.toLowerCase();
}

export function validateMinecraftUsername(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_]{3,16}$/.test(value)) {
    throw new ClassroomApiError(
      400,
      "invalid_minecraft_username",
      "Minecraft usernames must contain 3–16 letters, numbers, or underscores.",
    );
  }
  return value;
}

export function validateDateRange(startsOn: string, endsOn: string): void {
  if (!isDate(startsOn) || !isDate(endsOn) || endsOn < startsOn) {
    throw new ClassroomApiError(
      400,
      "invalid_input",
      "Choose valid start and end dates; the end cannot precede the start.",
    );
  }
}

export function nativeHostOnboardingActionAllowed(action: string): boolean {
  return action === "profile" || action === "pair_host";
}

export function createJoinCode(random: Uint8Array): string {
  if (random.byteLength < 8) {
    throw new Error("Eight random bytes are required.");
  }
  return [...random.slice(0, 8)]
    .map((value) => JOIN_CODE_ALPHABET[value % JOIN_CODE_ALPHABET.length])
    .join("");
}

export async function deriveJoinCode(
  secret: string,
  sessionId: string,
): Promise<string> {
  const signature = await hmacBytes(secret, `join-code:${sessionId}`);
  return createJoinCode(signature);
}

export async function hmacHex(secret: string, value: string): Promise<string> {
  return bytesToHex(await hmacBytes(secret, value));
}

async function hmacBytes(secret: string, value: string): Promise<Uint8Array> {
  if (secret.length < 32) {
    throw new Error("Credential pepper must contain at least 32 characters.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
}

export function validateClassroomProgram(value: unknown): ClassroomProgram {
  if (
    !isRecord(value) || value.schemaVersion !== 2 ||
    value.projectId !== "sheep-city"
  ) {
    throw invalidProgram(
      "The program must be a Sheep City schema version 2 program.",
    );
  }
  if (
    !validId(value.programId) || !Array.isArray(value.scripts) ||
    value.scripts.length !== 3
  ) {
    throw invalidProgram(
      "Sheep City requires Player, Game, and Sheep scripts.",
    );
  }

  const ids = new Set<string>([value.programId]);
  const scriptKinds = new Set<string>();
  let nodeCount = 1;
  const scripts = value.scripts.map((script, index) => {
    if (!isRecord(script)) {
      throw invalidProgram(`Script ${index + 1} is malformed.`);
    }
    const scriptKind = script.scriptKind;
    const displayName = script.displayName;
    if (
      script.nodeType !== "script" ||
      !validId(script.id) ||
      !["player", "game", "sheep"].includes(String(scriptKind)) ||
      !["Player", "Game", "Sheep"].includes(String(displayName)) ||
      !Array.isArray(script.body)
    ) {
      throw invalidProgram(
        `Script ${index + 1} contains an unsupported value.`,
      );
    }
    register(script.id);
    if (scriptKinds.has(String(scriptKind))) {
      throw invalidProgram("A script tab is duplicated.");
    }
    scriptKinds.add(String(scriptKind));
    const events = script.body.map((event, eventIndex) =>
      validateEvent(event, String(scriptKind), eventIndex)
    );
    return { ...script, body: events } as ClassroomScript;
  });
  if (!["player", "game", "sheep"].every((kind) => scriptKinds.has(kind))) {
    throw invalidProgram("Player, Game, and Sheep scripts are all required.");
  }
  if (nodeCount > 128) {
    throw invalidProgram("This Sheep City program exceeds the 128-node limit.");
  }
  return structuredClone({ ...value, scripts }) as ClassroomProgram;

  function register(id: string): void {
    nodeCount += 1;
    if (ids.has(id)) throw invalidProgram(`Two blocks use the ID “${id}”.`);
    ids.add(id);
  }

  function validateEvent(
    value: unknown,
    scriptKind: string,
    index: number,
  ): ClassroomEvent {
    if (
      !isRecord(value) ||
      !validId(value.id) ||
      !Array.isArray(value.body) ||
      ![
        "projectile_hit_event",
        "player_move_event",
        "sheep_spawn_event",
        "sheep_death_event",
      ].includes(String(value.nodeType))
    ) {
      throw invalidProgram(`Event ${index + 1} is malformed.`);
    }
    const eventKind = String(value.nodeType);
    const allowed = scriptKind === "player"
      ? ["projectile_hit_event", "player_move_event"]
      : scriptKind === "sheep"
      ? ["sheep_spawn_event", "sheep_death_event"]
      : [];
    if (!allowed.includes(eventKind)) {
      throw invalidProgram(
        `The ${eventKind} block belongs in a different script tab.`,
      );
    }
    if (value.body.length > 32) {
      throw invalidProgram("An event may contain at most 32 blocks.");
    }
    register(value.id);
    return {
      ...value,
      body: value.body.map((statement) =>
        validateStatement(statement, eventKind, 1)
      ),
    } as ClassroomEvent;
  }

  function validateStatement(
    value: unknown,
    eventKind: string,
    depth: number,
  ): ClassroomStatement {
    if (
      !isRecord(value) || !validId(value.id) ||
      typeof value.nodeType !== "string"
    ) {
      throw invalidProgram("A block contains an unsupported value.");
    }
    if (depth > 8) {
      throw invalidProgram("A block stack is nested more than 8 levels.");
    }
    register(value.id);
    const allowed: Record<string, string[]> = {
      projectile_hit_event: ["explode_at_hit"],
      player_move_event: ["if_then", "bounce_player"],
      sheep_spawn_event: ["set_sheep_color", "set_sheep_speed"],
      sheep_death_event: ["drop_item"],
    };
    if (!allowed[eventKind]?.includes(value.nodeType)) {
      throw invalidProgram(
        `${value.nodeType} cannot be used inside ${eventKind}.`,
      );
    }
    switch (value.nodeType) {
      case "explode_at_hit":
        if (!boundedNumber(value.power, 0.5, 4)) {
          throw invalidProgram("Explosion power must be from 0.5 to 4.");
        }
        break;
      case "bounce_player":
        if (!boundedNumber(value.verticalVelocity, 0.1, 3)) {
          throw invalidProgram("Bounce strength must be from 0.1 to 3.");
        }
        break;
      case "set_sheep_color":
        if (value.color !== "RED") {
          throw invalidProgram("Only RED sheep are supported.");
        }
        break;
      case "set_sheep_speed":
        if (!boundedNumber(value.multiplier, 0.1, 4)) {
          throw invalidProgram("Sheep speed must be from 0.1 to 4.");
        }
        break;
      case "drop_item":
        if (
          value.item !== "GOLD_INGOT" ||
          !Number.isInteger(value.quantity) ||
          !boundedNumber(value.quantity, 1, 16)
        ) {
          throw invalidProgram("The sheep drop must be 1 to 16 gold ingots.");
        }
        break;
      case "if_then":
        validateCondition(value.condition);
        if (!Array.isArray(value.then)) {
          throw invalidProgram("An if block needs a then stack.");
        }
        value.then.forEach((child) =>
          validateStatement(child, eventKind, depth + 1)
        );
        break;
    }
    return structuredClone(value) as ClassroomStatement;
  }

  function validateCondition(value: unknown): void {
    if (!isRecord(value) || !validId(value.id) || value.nodeType !== "equals") {
      throw invalidProgram(
        "An if block requires a supported equality condition.",
      );
    }
    register(value.id);
    validateMaterial(value.left);
    validateMaterial(value.right);
  }

  function validateMaterial(value: unknown): void {
    if (!isRecord(value) || !validId(value.id)) {
      throw invalidProgram("Material value is malformed.");
    }
    if (
      value.nodeType !== "get_material_under_player" &&
      !(value.nodeType === "material_literal" &&
        value.material === "GOLD_BLOCK")
    ) {
      throw invalidProgram(
        "Only getMaterialUnderPlayer and GOLD_BLOCK are supported.",
      );
    }
    register(value.id);
  }
}

export class ClassroomApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function invalidProgram(message: string): ClassroomApiError {
  return new ClassroomApiError(422, "invalid_program", message);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]{2,63}$/.test(value);
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= minimum && value <= maximum;
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}
