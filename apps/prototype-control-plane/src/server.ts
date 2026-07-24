import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { ConnectedPrototype, type PrototypeEvent } from "./prototype.js";
import {
  createPrototypePersistenceFromEnvironment,
  type PrototypePersistence,
} from "./persistence.js";

const HOST = "127.0.0.1";
const PORT = 4180;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_LABS = 8;
const LAB_LIFETIME_MS = 4 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);

interface LabRecord {
  prototype: ConnectedPrototype;
  expiresAt: number;
}

interface RateRecord {
  startedAt: number;
  requests: number;
}

export interface PrototypeServerState {
  labs: Map<string, LabRecord>;
  rates: Map<string, RateRecord>;
  persistence: PrototypePersistence;
}

export function createPrototypeServerState(): PrototypeServerState {
  return {
    labs: new Map(),
    rates: new Map(),
    persistence: createPrototypePersistenceFromEnvironment(),
  };
}

function json(response: ServerResponse, status: number, body: unknown, origin?: string): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "origin");
  }
  response.end(JSON.stringify(body));
}

function originOf(request: IncomingMessage): string | undefined {
  return request.headers.origin;
}

export function isAllowedPrototypeOrigin(origin: string | undefined): boolean {
  return origin !== undefined && ALLOWED_ORIGINS.has(origin);
}

export function isValidPrototypeToken(token: string | undefined): boolean {
  return token !== undefined && /^[A-Za-z0-9_-]{43}$/.test(token);
}

function authorizeOrigin(request: IncomingMessage, response: ServerResponse): string | undefined {
  const origin = originOf(request);
  if (!isAllowedPrototypeOrigin(origin)) {
    json(response, 403, {
      error: "This prototype accepts requests only from the local Code Studio Web origin.",
    });
    return undefined;
  }
  return origin;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await new Promise<Buffer>((resolve, reject) => {
    let size = 0;
    const chunks: Uint8Array[] = [];
    request.on("data", (chunk: unknown) => {
      const bytes =
        typeof chunk === "string"
          ? Buffer.from(chunk)
          : chunk instanceof Uint8Array
            ? chunk
            : undefined;
      if (!bytes) {
        reject(new Error("Request body contains an unsupported value."));
        return;
      }
      size += bytes.byteLength;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body exceeds the 512 KB prototype limit."));
        request.destroy();
        return;
      }
      chunks.push(bytes);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
  if (body.byteLength === 0) return {};
  const parsed: unknown = JSON.parse(body.toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Request body must be a JSON object.");
  return parsed as Record<string, unknown>;
}

function tokenOf(request: IncomingMessage): string | undefined {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return undefined;
  const token = authorization.slice("Bearer ".length);
  return isValidPrototypeToken(token) ? token : undefined;
}

async function labFor(
  request: IncomingMessage,
  response: ServerResponse,
  state: PrototypeServerState,
  origin: string,
): Promise<{ token: string; record: LabRecord } | undefined> {
  const token = tokenOf(request);
  if (!token) {
    json(response, 401, { error: "The local lab session is missing or expired." }, origin);
    return undefined;
  }
  let record = state.labs.get(token);
  if (!record) {
    const recovered = await state.persistence.loadRecovery(token);
    if (recovered !== undefined) {
      record = {
        prototype: ConnectedPrototype.recover(recovered, state.persistence),
        expiresAt: Date.now() + LAB_LIFETIME_MS,
      };
      state.labs.set(token, record);
    }
  }
  if (!record || record.expiresAt <= Date.now()) {
    state.labs.delete(token);
    json(response, 401, { error: "The local lab session is missing or expired." }, origin);
    return undefined;
  }
  record.expiresAt = Date.now() + LAB_LIFETIME_MS;
  return { token, record };
}

async function persistLab(
  persistence: PrototypePersistence,
  token: string,
  record: LabRecord,
): Promise<void> {
  try {
    await persistence.saveRecovery(
      token,
      record.prototype.recoveryState(),
      new Date(record.expiresAt),
    );
    record.prototype.markRecoveryPersistence(true);
  } catch {
    record.prototype.markRecoveryPersistence(false);
  }
}

function enforceRate(
  request: IncomingMessage,
  response: ServerResponse,
  state: PrototypeServerState,
  origin: string,
): boolean {
  const key = request.socket.remoteAddress ?? "loopback";
  const now = Date.now();
  const current = state.rates.get(key);
  const record =
    !current || now - current.startedAt >= 60_000 ? { startedAt: now, requests: 0 } : current;
  record.requests += 1;
  state.rates.set(key, record);
  if (record.requests <= 120) return true;
  json(response, 429, { error: "The local prototype request limit was reached." }, origin);
  return false;
}

function cleanup(state: PrototypeServerState): void {
  const now = Date.now();
  for (const [token, lab] of state.labs) if (lab.expiresAt <= now) state.labs.delete(token);
  for (const [key, rate] of state.rates)
    if (now - rate.startedAt >= 60_000) state.rates.delete(key);
}

export function createPrototypeRequestHandler(state = createPrototypeServerState()) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
    if (request.method === "GET" && url.pathname === "/health") {
      json(response, 200, {
        ok: true,
        mode: process.env.BADGERBOTS_PAPER_BRIDGE_DIR
          ? "loopback-paper-prototype"
          : "loopback-memory-only",
        paperConnected: Boolean(process.env.BADGERBOTS_PAPER_BRIDGE_DIR),
        persistenceMode: state.persistence.mode,
      });
      return;
    }
    const origin = authorizeOrigin(request, response);
    if (!origin) return;
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      response.setHeader("access-control-allow-headers", "authorization, content-type");
      response.setHeader("access-control-max-age", "600");
      response.setHeader("vary", "origin");
      response.end();
      return;
    }
    if (!enforceRate(request, response, state, origin)) return;
    cleanup(state);
    try {
      if (request.method === "POST" && url.pathname === "/api/lab/bootstrap") {
        if (state.labs.size >= MAX_LABS) {
          json(response, 503, { error: "All eight local prototype lab slots are in use." }, origin);
          return;
        }
        const token = randomBytes(32).toString("base64url");
        const prototype = new ConnectedPrototype(state.persistence);
        const initialized = await prototype.initialize();
        const record = {
          prototype,
          expiresAt: Date.now() + LAB_LIFETIME_MS,
        };
        state.labs.set(token, record);
        await persistLab(state.persistence, token, record);
        json(
          response,
          201,
          { labToken: token, joinCode: initialized.joinCode, snapshot: prototype.snapshot() },
          origin,
        );
        return;
      }
      const lab = await labFor(request, response, state, origin);
      if (!lab) return;
      const { prototype } = lab.record;
      if (request.method === "GET" && url.pathname === "/api/lab/state") {
        json(
          response,
          200,
          { joinCode: prototype.joinCode(), snapshot: prototype.snapshot() },
          origin,
        );
        return;
      }
      if (request.method !== "POST") {
        json(response, 404, { error: "Prototype route was not found." }, origin);
        return;
      }
      const body = await readJson(request);
      if (url.pathname === "/api/lab/join") {
        await prototype.join({
          joinCode: requiredString(body.joinCode, "joinCode"),
          firstName: requiredString(body.firstName, "firstName"),
          lastInitial: requiredString(body.lastInitial, "lastInitial"),
        });
        await persistLab(state.persistence, lab.token, lab.record);
        json(response, 200, { snapshot: prototype.snapshot() }, origin);
        return;
      }
      if (url.pathname === "/api/lab/save") {
        const baseRevision = body.baseRevision;
        if (!Number.isSafeInteger(baseRevision) || (baseRevision as number) < 0)
          throw new Error("baseRevision must be a non-negative integer.");
        await prototype.save(body.program, baseRevision as number);
        await persistLab(state.persistence, lab.token, lab.record);
        json(response, 200, { snapshot: prototype.snapshot() }, origin);
        return;
      }
      if (url.pathname === "/api/lab/run") {
        await prototype.run();
        await persistLab(state.persistence, lab.token, lab.record);
        json(response, 200, { snapshot: prototype.snapshot() }, origin);
        return;
      }
      if (url.pathname === "/api/lab/reject-invalid") {
        await prototype.attemptRejectedDeployment();
        await persistLab(state.persistence, lab.token, lab.record);
        json(response, 200, { snapshot: prototype.snapshot() }, origin);
        return;
      }
      if (url.pathname === "/api/lab/event") {
        const event = requiredString(body.event, "event");
        if (!isPrototypeEvent(event)) throw new Error("Unsupported prototype event.");
        const material = body.materialUnderPlayer;
        if (material !== undefined && material !== "GOLD_BLOCK" && material !== "OTHER")
          throw new Error("materialUnderPlayer must be GOLD_BLOCK or OTHER.");
        prototype.trigger({
          event,
          ...(material ? { materialUnderPlayer: material } : {}),
        });
        await persistLab(state.persistence, lab.token, lab.record);
        json(response, 200, { snapshot: prototype.snapshot() }, origin);
        return;
      }
      if (url.pathname === "/api/lab/stop") {
        await prototype.stop();
        await persistLab(state.persistence, lab.token, lab.record);
        json(response, 200, { snapshot: prototype.snapshot() }, origin);
        return;
      }
      json(response, 404, { error: "Prototype route was not found." }, origin);
    } catch (error) {
      json(
        response,
        error instanceof SyntaxError ? 400 : 422,
        { error: error instanceof Error ? error.message : "Prototype request failed." },
        origin,
      );
    }
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200)
    throw new Error(`${field} must be a non-empty string of 200 characters or fewer.`);
  return value;
}

function isPrototypeEvent(value: string): value is PrototypeEvent {
  return ["projectile_hit", "player_move", "sheep_spawn", "sheep_death"].includes(value);
}

export function startPrototypeServer(): ReturnType<typeof createServer> {
  const state = createPrototypeServerState();
  const handler = createPrototypeRequestHandler(state);
  const server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      if (!response.headersSent)
        json(response, 500, { error: "The local prototype request failed." });
      else response.end();
    });
  });
  server.listen(PORT, HOST, () => {
    const runtimeMode = process.env.BADGERBOTS_PAPER_BRIDGE_DIR ? "Paper" : "headless";
    process.stdout.write(
      `BadgerBots connected prototype listening on http://${HOST}:${PORT} (loopback only; ${runtimeMode} runtime; ${state.persistence.mode} persistence).\n`,
    );
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  startPrototypeServer();
