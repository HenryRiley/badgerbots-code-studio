import type { Program } from "@badgerbots/program-model";
import type {
  CamperId,
  InstructorId,
  InstructorRole,
  LocationId,
  OrganizationId,
  ProgramAuthor,
  ProgramVersionId,
  RealtimeHint,
  SessionId,
  SessionRetentionState,
  WorkspaceId,
} from "@badgerbots/shared-types";

export interface InstructorAuthAdmin {
  createInstructor(input: { email: string; password: string }): Promise<{ authUserId: string }>;
}

export interface Organization {
  id: OrganizationId;
  name: string;
}

export interface Location {
  id: LocationId;
  organizationId: OrganizationId;
  name: string;
}

export interface Instructor {
  id: InstructorId;
  authUserId: string;
  normalizedEmail: string;
  displayEmail: string;
}

export interface Membership {
  organizationId: OrganizationId;
  instructorId: InstructorId;
  role: InstructorRole;
}

export interface CampSession {
  id: SessionId;
  organizationId: OrganizationId;
  locationId: LocationId;
  ownerInstructorId: InstructorId;
  assistantInstructorIds: InstructorId[];
  trackId: string;
  startsOn: string;
  endsOn: string;
  joinCodeDigest: string;
  retentionState: SessionRetentionState;
  recoverableUntil?: string;
}

export interface Camper {
  id: CamperId;
  sessionId: SessionId;
  firstName: string;
  lastInitial: string;
  accessTokenDigest: string;
}

export interface Workspace {
  id: WorkspaceId;
  organizationId: OrganizationId;
  sessionId: SessionId;
  camperId: CamperId;
  projectId: "sheep-city";
  revision: number;
  currentProgram: Program;
}

export interface ProgramVersion {
  id: ProgramVersionId;
  workspaceId: WorkspaceId;
  revision: number;
  program: Program;
  author: ProgramAuthor;
  clientMutationId: string;
  createdAt: string;
  restoredFromVersionId?: ProgramVersionId;
}

export interface AuditRecord {
  id: string;
  organizationId: OrganizationId;
  sessionId?: SessionId;
  actorKind: "system" | "instructor" | "camper";
  actorId?: string;
  action: string;
  targetId: string;
  correlationId: string;
  occurredAt: string;
}

export interface StoreState {
  organizations: Organization[];
  locations: Location[];
  instructors: Instructor[];
  memberships: Membership[];
  sessions: CampSession[];
  campers: Camper[];
  workspaces: Workspace[];
  versions: ProgramVersion[];
  audits: AuditRecord[];
  realtimeHints: RealtimeHint[];
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(kind: string): string;
}

export interface SecretHasher {
  digest(secret: string): string;
}
