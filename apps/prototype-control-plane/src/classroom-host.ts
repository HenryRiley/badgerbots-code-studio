import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { migrateProgram, validateProgram } from "@badgerbots/program-model";
import {
  compileInstructionGraph,
  type RuntimeCommand,
  type RuntimeScopeAddress,
  type SignedRuntimeEnvelope,
} from "@badgerbots/runtime-protocol";
import { PaperFileClient } from "./prototype.js";

export interface CloudCommand {
  id: string;
  organizationId: string;
  locationId: string;
  sessionId: string;
  workspaceId: string;
  sequence: number;
  kind: "deploy_program" | "stop_program";
  payload: Record<string, unknown>;
  issuedAt: string;
  expiresAt: string;
}

interface HostAcknowledgement {
  commandId: string;
  status: "accepted" | "rejected";
  code?: string;
  activeRuntimeVersionId?: string;
}

export interface ClassroomHostWorker {
  stop(): void;
}

export function startClassroomHostWorkerFromEnvironment(): ClassroomHostWorker | undefined {
  const hostId = process.env.BADGERBOTS_CLASSROOM_HOST_ID;
  const hostToken = process.env.BADGERBOTS_CLASSROOM_HOST_TOKEN;
  const apiUrl =
    process.env.BADGERBOTS_CLASSROOM_API_URL ??
    (process.env.BB_SUPABASE_URL
      ? `${process.env.BB_SUPABASE_URL}/functions/v1/classroom-api`
      : undefined);
  const publishableKey =
    process.env.BADGERBOTS_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const bridgeDirectory = process.env.BADGERBOTS_PAPER_BRIDGE_DIR;
  const bridgeSecret = process.env.BADGERBOTS_PAPER_BRIDGE_SECRET;
  const values = [hostId, hostToken, apiUrl, publishableKey];
  if (values.every((value) => !value)) return undefined;
  if (
    !hostId ||
    !/^[0-9a-f-]{36}$/i.test(hostId) ||
    !hostToken ||
    hostToken.length < 43 ||
    !apiUrl ||
    !apiUrl.startsWith("https://") ||
    !publishableKey ||
    !bridgeDirectory ||
    !bridgeSecret
  )
    throw new Error(
      "Connected Host requires a valid Host ID/token, HTTPS classroom API URL, publishable key, and Paper bridge.",
    );
  const worker = new OutboundClassroomHost(
    hostId,
    hostToken,
    apiUrl,
    publishableKey,
    new PaperFileClient(bridgeDirectory, bridgeSecret),
  );
  worker.start();
  return worker;
}

class OutboundClassroomHost implements ClassroomHostWorker {
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private highestSequence = -1;
  private readonly acknowledgements = new Map<string, HostAcknowledgement>();

  constructor(
    private readonly hostId: string,
    private readonly token: string,
    private readonly apiUrl: string,
    private readonly publishableKey: string,
    private readonly paper: PaperFileClient,
  ) {}

  start(): void {
    process.stdout.write(
      `Connected classroom Host ${this.hostId} is polling outbound over authenticated HTTPS.\n`,
    );
    void this.poll();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private async poll(): Promise<void> {
    if (this.stopped) return;
    let nextDelay = 5_000;
    try {
      const result = await this.request<{ command: CloudCommand | null; signature?: string }>({
        action: "host_poll",
      });
      if (result.command) {
        nextDelay = 1_000;
        if (!result.signature || !this.verify(JSON.stringify(result.command), result.signature))
          throw new Error("Cloud command signature was rejected.");
        await this.handle(result.command);
      }
    } catch (error) {
      process.stderr.write(
        `Connected classroom Host warning: ${
          error instanceof Error ? error.message : "outbound poll failed"
        }\n`,
      );
    } finally {
      if (!this.stopped) this.timer = setTimeout(() => void this.poll(), nextDelay);
    }
  }

  private async handle(command: CloudCommand): Promise<void> {
    const prior = this.acknowledgements.get(command.id);
    if (prior) {
      await this.acknowledge(prior);
      return;
    }
    if (
      !Number.isSafeInteger(command.sequence) ||
      command.sequence <= this.highestSequence ||
      Date.parse(command.expiresAt) <= Date.now()
    ) {
      await this.rememberAndAcknowledge({
        commandId: command.id,
        status: "rejected",
        code: "stale_or_expired_command",
      });
      return;
    }
    this.highestSequence = command.sequence;
    const scope = this.scope(command);
    try {
      const runtimeCommand = this.runtimeCommand(command);
      const envelope: SignedRuntimeEnvelope = {
        protocolVersion: 1,
        channel: "host_to_plugin",
        senderId: this.hostId,
        recipientId: "paper-plugin",
        commandId: command.id,
        sequence: command.sequence,
        issuedAt: Date.parse(command.issuedAt),
        expiresAt: Date.parse(command.expiresAt),
        nonce: randomBytes(16).toString("base64url"),
        scope,
        command: runtimeCommand,
        signature: "authenticated-by-local-paper-bridge",
      };
      const paper = await this.paper.deliver(envelope, scope);
      await this.rememberAndAcknowledge({
        commandId: command.id,
        status: paper.status,
        ...(paper.code ? { code: paper.code } : {}),
        ...(paper.activeProgramVersionId
          ? { activeRuntimeVersionId: paper.activeProgramVersionId }
          : {}),
      });
    } catch (error) {
      await this.rememberAndAcknowledge({
        commandId: command.id,
        status: "rejected",
        code:
          error instanceof Error && error.message.startsWith("Cannot compile")
            ? "program_validation_failed"
            : "host_delivery_failed",
      });
    }
  }

  private runtimeCommand(command: CloudCommand): RuntimeCommand {
    return compileCloudRuntimeCommand(command);
  }

  private scope(command: CloudCommand): RuntimeScopeAddress {
    const camperId = command.payload.camperId;
    const projectId = command.payload.projectId;
    return {
      organizationId: command.organizationId,
      locationId: command.locationId,
      sessionId: command.sessionId,
      projectId: typeof projectId === "string" ? projectId : "sheep-city",
      studentId: typeof camperId === "string" ? camperId : command.workspaceId,
      worldId: `classroom-world-${typeof camperId === "string" ? camperId : command.workspaceId}`,
    };
  }

  private async rememberAndAcknowledge(acknowledgement: HostAcknowledgement): Promise<void> {
    this.acknowledgements.set(acknowledgement.commandId, acknowledgement);
    while (this.acknowledgements.size > 512) {
      const oldest = this.acknowledgements.keys().next().value;
      if (typeof oldest === "string") this.acknowledgements.delete(oldest);
      else break;
    }
    await this.acknowledge(acknowledgement);
  }

  private async acknowledge(acknowledgement: HostAcknowledgement): Promise<void> {
    await this.request({
      action: "host_ack",
      ...acknowledgement,
      signature: this.sign(JSON.stringify(acknowledgement)),
    });
  }

  private async request<T extends Record<string, unknown>>(
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        apikey: this.publishableKey,
        "content-type": "application/json",
        "x-badgerbots-host-id": this.hostId,
        "x-badgerbots-host-token": this.token,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const result = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(result.error ?? `classroom API returned ${response.status}`);
    return result;
  }

  private sign(payload: string): string {
    return signClassroomHostPayload(this.token, payload);
  }

  private verify(payload: string, signature: string): boolean {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
    return timingSafeEqual(Buffer.from(this.sign(payload), "hex"), Buffer.from(signature, "hex"));
  }
}

export function compileCloudRuntimeCommand(command: CloudCommand): RuntimeCommand {
  if (command.kind === "stop_program") return { kind: "stop_program", reason: "instructor" };
  const versionId = command.payload.programVersionId;
  if (typeof versionId !== "string")
    throw new Error("Cloud deployment omitted its program version.");
  const program = migrateProgram(command.payload.program);
  const validation = validateProgram(program);
  if (!validation.ok)
    throw new Error(`Cannot compile invalid program: ${validation.diagnostics[0]?.message}`);
  const expected = command.payload.expectedActiveVersionId;
  return {
    kind: "deploy_program",
    programVersionId: versionId,
    ...(typeof expected === "string" ? { expectedActiveVersionId: expected } : {}),
    graph: compileInstructionGraph(program),
  };
}

export function signClassroomHostPayload(token: string, payload: string): string {
  return createHmac("sha256", token).update(payload).digest("hex");
}
