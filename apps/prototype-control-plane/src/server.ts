import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { ConnectedPrototype, type PrototypeEvent } from "./prototype.js";

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
}

export function createPrototypeServerState(): PrototypeServerState {
  return { labs: new Map(), rates: new Map() };
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

function labFor(
  request: IncomingMessage,
  response: ServerResponse,
  state: PrototypeServerState,
  origin: string,
): ConnectedPrototype | undefined {
  const token = tokenOf(request);
  const record = token ? state.labs.get(token) : undefined;
  if (!record || record.expiresAt <= Date.now()) {
    if (token) state.labs.delete(token);
    json(response, 401, { error: "The local lab session is missing or expired." }, origin);
    return undefined;
  }
  record.expiresAt = Date.now() + LAB_LIFETIME_MS;
  return record.prototype;
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
        mode: "loopback-memory-only",
        paperConnected: false,
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
        const prototype = new ConnectedPrototype();
        const initialized = await prototype.initialize();
        state.labs.set(token, {
          prototype,
          expiresAt: Date.now() + LAB_LIFETIME_MS,
        });
        json(response, 201, { labToken: token, ...initialized }, origin);
        return;
      }
      const prototype = labFor(request, response, state, origin);
      if (!prototype) return;
      if (request.method === "GET" && url.pathname === "/api/lab/state") {
        json(response, 200, { snapshot: prototype.snapshot() }, origin);
        return;
      }
      if (request.method !== "POST") {
        json(response, 404, { error: "Prototype route was not found." }, origin);
        return;
      }
      const body = await readJson(request);
      if (url.pathname === "/api/lab/join") {
        const snapshot = prototype.join({
          joinCode: requiredString(body.joinCode, "joinCode"),
          firstName: requiredString(body.firstName, "firstName"),
          lastInitial: requiredString(body.lastInitial, "lastInitial"),
        });
        json(response, 200, { snapshot }, origin);
        return;
      }
      if (url.pathname === "/api/lab/save") {
        const baseRevision = body.baseRevision;
        if (!Number.isSafeInteger(baseRevision) || (baseRevision as number) < 0)
          throw new Error("baseRevision must be a non-negative integer.");
        const snapshot = prototype.save(body.program, baseRevision as number);
        json(response, 200, { snapshot }, origin);
        return;
      }
      if (url.pathname === "/api/lab/run") {
        json(response, 200, { snapshot: await prototype.run() }, origin);
        return;
      }
      if (url.pathname === "/api/lab/reject-invalid") {
        json(response, 200, { snapshot: await prototype.attemptRejectedDeployment() }, origin);
        return;
      }
      if (url.pathname === "/api/lab/event") {
        const event = requiredString(body.event, "event");
        if (!isPrototypeEvent(event)) throw new Error("Unsupported prototype event.");
        const material = body.materialUnderPlayer;
        if (material !== undefined && material !== "GOLD_BLOCK" && material !== "OTHER")
          throw new Error("materialUnderPlayer must be GOLD_BLOCK or OTHER.");
        const snapshot = prototype.trigger({
          event,
          ...(material ? { materialUnderPlayer: material } : {}),
        });
        json(response, 200, { snapshot }, origin);
        return;
      }
      if (url.pathname === "/api/lab/stop") {
        json(response, 200, { snapshot: await prototype.stop() }, origin);
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
  const handler = createPrototypeRequestHandler();
  const server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      if (!response.headersSent)
        json(response, 500, { error: "The local prototype request failed." });
      else response.end();
    });
  });
  server.listen(PORT, HOST, () => {
    process.stdout.write(
      `BadgerBots connected prototype listening on http://${HOST}:${PORT} (loopback only; no Paper connection).\n`,
    );
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  startPrototypeServer();
