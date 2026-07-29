export type WorldStrategy = "separate-worlds" | "shared-instances";
export type LeaseLifecycle = "active" | "released";

export interface LeaseScope {
  organizationId: string;
  locationId: string;
  sessionId: string;
  projectId: "sheep-city";
  ownerStudentId: string;
}

export interface InstanceBounds {
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
}

export interface PrivateWorldLease {
  leaseId: string;
  strategy: WorldStrategy;
  scope: LeaseScope;
  logicalWorldId: string;
  physicalWorldId: string;
  instanceBounds?: InstanceBounds;
  approvedVisitorIds: string[];
  lifecycle: LeaseLifecycle;
}

export type LeaseAdmission =
  { ok: true; lease: PrivateWorldLease } | { ok: false; code: "capacity_closed"; message: string };

export interface LeaseCapacityGate {
  canAcceptLease(): boolean;
  refusalReason(): string;
}

export interface ReleaseResult {
  releasedLeaseId: string;
  evictedVisitorIds: string[];
}

const opaqueIdPattern = /^[a-z][a-z0-9-]{2,63}$/;

function requireOpaqueId(value: string, label: string): void {
  if (!opaqueIdPattern.test(value)) throw new Error(`${label} is not a valid opaque identifier.`);
}

function cloneLease(lease: PrivateWorldLease): PrivateWorldLease {
  return structuredClone(lease);
}

abstract class BaseLeaseManager {
  protected readonly leases = new Map<string, PrivateWorldLease>();
  private sequence = 0;

  constructor(
    protected readonly capacity: LeaseCapacityGate,
    private readonly maximumActiveLeases = 25,
  ) {
    if (!Number.isInteger(maximumActiveLeases) || maximumActiveLeases < 1)
      throw new Error("Maximum active leases must be a positive integer.");
  }

  allocate(scope: LeaseScope): LeaseAdmission {
    this.validateScope(scope);
    const existing = [...this.leases.values()].find(
      (lease) =>
        lease.lifecycle === "active" &&
        lease.scope.sessionId === scope.sessionId &&
        lease.scope.ownerStudentId === scope.ownerStudentId &&
        lease.scope.projectId === scope.projectId,
    );
    if (existing) return { ok: true, lease: cloneLease(existing) };
    if (
      !this.capacity.canAcceptLease() ||
      [...this.leases.values()].filter((lease) => lease.lifecycle === "active").length >=
        this.maximumActiveLeases
    ) {
      return {
        ok: false,
        code: "capacity_closed",
        message: this.capacity.canAcceptLease()
          ? "This Host has reached its configured private-world limit."
          : this.capacity.refusalReason(),
      };
    }
    this.sequence += 1;
    const leaseId = `lease-${String(this.sequence).padStart(3, "0")}`;
    const lease = this.createLease(leaseId, structuredClone(scope), this.sequence - 1);
    this.leases.set(leaseId, lease);
    return { ok: true, lease: cloneLease(lease) };
  }

  get(leaseId: string): PrivateWorldLease | undefined {
    const lease = this.leases.get(leaseId);
    return lease ? cloneLease(lease) : undefined;
  }

  activeLeases(): PrivateWorldLease[] {
    return [...this.leases.values()]
      .filter((lease) => lease.lifecycle === "active")
      .map(cloneLease);
  }

  approveVisitor(leaseId: string, ownerStudentId: string, visitorStudentId: string): void {
    requireOpaqueId(visitorStudentId, "Visitor student ID");
    const lease = this.requireActiveLease(leaseId);
    if (lease.scope.ownerStudentId !== ownerStudentId)
      throw new Error("Only the world owner may approve a visitor.");
    if (visitorStudentId === ownerStudentId)
      throw new Error("The world owner cannot be added as a visitor.");
    if (!lease.approvedVisitorIds.includes(visitorStudentId))
      lease.approvedVisitorIds.push(visitorStudentId);
  }

  canEnter(leaseId: string, studentId: string): boolean {
    const lease = this.leases.get(leaseId);
    return Boolean(
      lease &&
      lease.lifecycle === "active" &&
      (lease.scope.ownerStudentId === studentId || lease.approvedVisitorIds.includes(studentId)),
    );
  }

  canEdit(leaseId: string, studentId: string): boolean {
    const lease = this.leases.get(leaseId);
    return Boolean(
      lease && lease.lifecycle === "active" && lease.scope.ownerStudentId === studentId,
    );
  }

  assertPositionInsideLease(leaseId: string, x: number, z: number): void {
    const lease = this.requireActiveLease(leaseId);
    if (!lease.instanceBounds) return;
    const bounds = lease.instanceBounds;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      x < bounds.minimumX ||
      x > bounds.maximumX ||
      z < bounds.minimumZ ||
      z > bounds.maximumZ
    )
      throw new Error("Position crosses the private instance boundary.");
  }

  releaseForOwnerDeparture(leaseId: string, ownerStudentId: string): ReleaseResult {
    const lease = this.requireActiveLease(leaseId);
    if (lease.scope.ownerStudentId !== ownerStudentId)
      throw new Error("Only the world owner departure may release this lease.");
    lease.lifecycle = "released";
    const evictedVisitorIds = [...lease.approvedVisitorIds];
    lease.approvedVisitorIds.length = 0;
    return { releasedLeaseId: leaseId, evictedVisitorIds };
  }

  protected abstract createLease(
    leaseId: string,
    scope: LeaseScope,
    zeroBasedSlot: number,
  ): PrivateWorldLease;

  private requireActiveLease(leaseId: string): PrivateWorldLease {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.lifecycle !== "active")
      throw new Error("Private-world lease is not active.");
    return lease;
  }

  private validateScope(scope: LeaseScope): void {
    requireOpaqueId(scope.organizationId, "Organization ID");
    requireOpaqueId(scope.locationId, "Location ID");
    requireOpaqueId(scope.sessionId, "Session ID");
    requireOpaqueId(scope.ownerStudentId, "Owner student ID");
    if (scope.projectId !== "sheep-city") throw new Error("Unsupported world-lease project.");
  }
}

export class SeparateWorldLeaseManager extends BaseLeaseManager {
  protected createLease(
    leaseId: string,
    scope: LeaseScope,
    zeroBasedSlot: number,
  ): PrivateWorldLease {
    return {
      leaseId,
      strategy: "separate-worlds",
      scope,
      logicalWorldId: leaseId,
      physicalWorldId: `bb-private-${String(zeroBasedSlot + 1).padStart(3, "0")}`,
      approvedVisitorIds: [],
      lifecycle: "active",
    };
  }
}

export interface SharedInstanceOptions {
  instancesPerPhysicalWorld: number;
  instanceSize: number;
  separation: number;
}

export class SharedInstanceLeaseManager extends BaseLeaseManager {
  constructor(
    capacity: LeaseCapacityGate,
    private readonly options: SharedInstanceOptions = {
      instancesPerPhysicalWorld: 9,
      instanceSize: 256,
      separation: 4096,
    },
    maximumActiveLeases = 25,
  ) {
    super(capacity, maximumActiveLeases);
    if (
      !Number.isInteger(options.instancesPerPhysicalWorld) ||
      options.instancesPerPhysicalWorld < 1 ||
      !Number.isInteger(Math.sqrt(options.instancesPerPhysicalWorld))
    )
      throw new Error("Shared instances per world must be a positive square number.");
    if (
      !Number.isInteger(options.instanceSize) ||
      options.instanceSize < 32 ||
      options.instanceSize > 512
    )
      throw new Error("Shared instance size must be an integer from 32 to 512.");
    if (!Number.isInteger(options.separation) || options.separation < options.instanceSize * 4)
      throw new Error("Shared instance separation must be at least four instance widths.");
  }

  protected createLease(
    leaseId: string,
    scope: LeaseScope,
    zeroBasedSlot: number,
  ): PrivateWorldLease {
    const worldIndex = Math.floor(zeroBasedSlot / this.options.instancesPerPhysicalWorld);
    const slotInWorld = zeroBasedSlot % this.options.instancesPerPhysicalWorld;
    const gridWidth = Math.sqrt(this.options.instancesPerPhysicalWorld);
    const column = slotInWorld % gridWidth;
    const row = Math.floor(slotInWorld / gridWidth);
    const centerX = column * this.options.separation;
    const centerZ = row * this.options.separation;
    const halfSize = this.options.instanceSize / 2;
    return {
      leaseId,
      strategy: "shared-instances",
      scope,
      logicalWorldId: leaseId,
      physicalWorldId: `bb-shared-${String(worldIndex + 1).padStart(2, "0")}`,
      instanceBounds: {
        minimumX: centerX - halfSize,
        maximumX: centerX + halfSize,
        minimumZ: centerZ - halfSize,
        maximumZ: centerZ + halfSize,
      },
      approvedVisitorIds: [],
      lifecycle: "active",
    };
  }
}
