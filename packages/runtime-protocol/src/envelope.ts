import type { InstructionGraphV2 } from "./instruction-graph.js";

export const RUNTIME_PROTOCOL_VERSION = 1 as const;

export interface RuntimeScopeAddress {
  organizationId: string;
  locationId: string;
  sessionId: string;
  projectId: string;
  studentId: string;
  worldId: string;
}

export type RuntimeCommand =
  | {
      kind: "deploy_program";
      programVersionId: string;
      expectedActiveVersionId?: string;
      graph: InstructionGraphV2;
    }
  | { kind: "stop_program"; reason: "student" | "instructor" | "disconnect" | "world_unload" }
  | { kind: "ping"; requestId: string }
  | {
      kind: "acknowledgement";
      acknowledgedCommandId: string;
      status: "accepted" | "duplicate" | "rejected";
      code?: string;
      activeProgramVersionId?: string;
    };

export interface UnsignedRuntimeEnvelope<TCommand extends RuntimeCommand = RuntimeCommand> {
  protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  channel: "cloud_to_host" | "host_to_cloud" | "host_to_plugin" | "plugin_to_host";
  senderId: string;
  recipientId: string;
  commandId: string;
  sequence: number;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  scope: RuntimeScopeAddress;
  command: TCommand;
}

export interface SignedRuntimeEnvelope<
  TCommand extends RuntimeCommand = RuntimeCommand,
> extends UnsignedRuntimeEnvelope<TCommand> {
  signature: string;
}

export interface EnvelopeAuthenticator {
  sign(message: string): Promise<string>;
  verify(message: string, signature: string): Promise<boolean>;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  return value;
}

export function canonicalEnvelopeMessage(envelope: UnsignedRuntimeEnvelope): string {
  return JSON.stringify(canonicalValue(envelope));
}

export async function signRuntimeEnvelope<TCommand extends RuntimeCommand>(
  envelope: UnsignedRuntimeEnvelope<TCommand>,
  authenticator: EnvelopeAuthenticator,
): Promise<SignedRuntimeEnvelope<TCommand>> {
  return { ...envelope, signature: await authenticator.sign(canonicalEnvelopeMessage(envelope)) };
}

export type ReplayDisposition = "accepted" | "duplicate" | "stale_sequence";

export interface ReplayLedger {
  accept(senderId: string, commandId: string, sequence: number): ReplayDisposition;
}

export class MemoryReplayLedger implements ReplayLedger {
  private readonly senders = new Map<
    string,
    { highestSequence: number; commandIds: Set<string>; order: string[] }
  >();

  constructor(private readonly retainedCommandIds = 2048) {
    if (retainedCommandIds < 32) throw new Error("Replay ledger must retain at least 32 commands.");
  }

  accept(senderId: string, commandId: string, sequence: number): ReplayDisposition {
    const sender = this.senders.get(senderId) ?? {
      highestSequence: -1,
      commandIds: new Set<string>(),
      order: [],
    };
    if (sender.commandIds.has(commandId)) return "duplicate";
    if (!Number.isSafeInteger(sequence) || sequence <= sender.highestSequence)
      return "stale_sequence";
    sender.highestSequence = sequence;
    sender.commandIds.add(commandId);
    sender.order.push(commandId);
    while (sender.order.length > this.retainedCommandIds) {
      const removed = sender.order.shift();
      if (removed) sender.commandIds.delete(removed);
    }
    this.senders.set(senderId, sender);
    return "accepted";
  }
}

export type EnvelopeVerification =
  | { ok: true; disposition: "accepted" | "duplicate" }
  | {
      ok: false;
      code:
        | "unsupported_protocol"
        | "wrong_channel"
        | "wrong_recipient"
        | "wrong_scope"
        | "invalid_time_window"
        | "expired"
        | "invalid_signature"
        | "stale_sequence";
      message: string;
    };

export async function verifyRuntimeEnvelope(
  envelope: SignedRuntimeEnvelope,
  expected: {
    channel: SignedRuntimeEnvelope["channel"];
    recipientId: string;
    scope: RuntimeScopeAddress;
    now: number;
    maximumLifetimeMs?: number;
  },
  authenticator: EnvelopeAuthenticator,
  replayLedger: ReplayLedger,
): Promise<EnvelopeVerification> {
  if (envelope.protocolVersion !== RUNTIME_PROTOCOL_VERSION)
    return { ok: false, code: "unsupported_protocol", message: "Unsupported runtime protocol." };
  const maximumLifetimeMs = expected.maximumLifetimeMs ?? 60_000;
  if (
    !Number.isSafeInteger(envelope.issuedAt) ||
    !Number.isSafeInteger(envelope.expiresAt) ||
    envelope.expiresAt <= envelope.issuedAt ||
    envelope.expiresAt - envelope.issuedAt > maximumLifetimeMs
  )
    return { ok: false, code: "invalid_time_window", message: "Runtime time window is invalid." };
  if (expected.now < envelope.issuedAt - 5_000 || expected.now > envelope.expiresAt)
    return { ok: false, code: "expired", message: "Runtime command has expired." };
  const { signature, ...unsigned } = envelope;
  if (!(await authenticator.verify(canonicalEnvelopeMessage(unsigned), signature)))
    return { ok: false, code: "invalid_signature", message: "Runtime signature was rejected." };
  if (envelope.channel !== expected.channel)
    return { ok: false, code: "wrong_channel", message: "Runtime channel was rejected." };
  if (envelope.recipientId !== expected.recipientId)
    return { ok: false, code: "wrong_recipient", message: "Runtime recipient was rejected." };
  if (
    envelope.scope.organizationId !== expected.scope.organizationId ||
    envelope.scope.locationId !== expected.scope.locationId ||
    envelope.scope.sessionId !== expected.scope.sessionId ||
    envelope.scope.projectId !== expected.scope.projectId ||
    envelope.scope.studentId !== expected.scope.studentId ||
    envelope.scope.worldId !== expected.scope.worldId
  )
    return { ok: false, code: "wrong_scope", message: "Runtime scope was rejected." };
  const disposition = replayLedger.accept(envelope.senderId, envelope.commandId, envelope.sequence);
  if (disposition === "stale_sequence")
    return { ok: false, code: "stale_sequence", message: "Runtime sequence was rejected." };
  return { ok: true, disposition };
}
