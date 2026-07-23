export type OpaqueId<Kind extends string> = string & { readonly __kind: Kind };

export type OrganizationId = OpaqueId<"organization">;
export type LocationId = OpaqueId<"location">;
export type InstructorId = OpaqueId<"instructor">;
export type SessionId = OpaqueId<"session">;
export type CamperId = OpaqueId<"camper">;
export type DeviceId = OpaqueId<"device">;
export type WorkspaceId = OpaqueId<"workspace">;
export type ProgramVersionId = OpaqueId<"program-version">;

export type InstructorRole = "owner" | "assistant";
export type SessionRetentionState =
  "scheduled" | "active" | "hidden_recoverable" | "deletion_queued" | "deleted";

export type ProgramAuthor =
  { kind: "camper"; camperId: CamperId } | { kind: "instructor"; instructorId: InstructorId };

export interface RevisionConflict<T> {
  kind: "revision_conflict";
  expectedRevision: number;
  actualRevision: number;
  latest: T;
}

export interface RealtimeHint {
  protocolVersion: 1;
  sequence: number;
  organizationId: OrganizationId;
  sessionId: SessionId;
  topic: "roster" | "program" | "progress" | "help" | "runtime" | "retention";
  entityId: string;
  occurredAt: string;
}
