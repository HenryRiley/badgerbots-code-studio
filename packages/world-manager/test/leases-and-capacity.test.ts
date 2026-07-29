import { describe, expect, it } from "vitest";
import {
  CapacityController,
  SeparateWorldLeaseManager,
  SharedInstanceLeaseManager,
  buildStrategyBenchmarkReport,
  createTwentyFiveStudentPlan,
  runTwentyFiveStudentScenario,
  type BenchmarkSample,
  type LoadScenarioDriver,
  type LoadScenarioStudent,
  type PrivateWorldLease,
  type WorldStrategy,
} from "../src/index.js";

function sample(
  strategy: WorldStrategy,
  activeStudents: number,
  phase: BenchmarkSample["phase"] = "steady",
): BenchmarkSample {
  return {
    schemaVersion: 1,
    strategy,
    phase,
    activeStudents,
    measuredAt: "2026-07-23T18:00:00.000Z",
    processResidentMiB: 4_096,
    heapUsedMiB: 3_072,
    cpuPercent: 45,
    tickMs: 25,
    tps: 20,
    chunkLoadMs: 250,
    chunkUnloadMs: 200,
    runLatencyMs: 180,
    teacherResponseMs: 80,
    entityCount: 500,
    diskMiB: 1_024,
  };
}

function scope(index: number) {
  return {
    organizationId: "org-one",
    locationId: "location-one",
    sessionId: "session-one",
    projectId: "sheep-city" as const,
    ownerStudentId: `student-${String(index).padStart(2, "0")}`,
  };
}

describe("private world leases and capacity", () => {
  it("allocates 25 separate leases and refuses the twenty-sixth without weakening privacy", () => {
    const capacity = new CapacityController();
    const manager = new SeparateWorldLeaseManager(capacity);
    for (let index = 1; index <= 25; index += 1)
      expect(manager.allocate(scope(index)).ok).toBe(true);
    expect(manager.activeLeases()).toHaveLength(25);
    expect(manager.allocate(scope(26))).toMatchObject({
      ok: false,
      code: "capacity_closed",
    });
    expect(new Set(manager.activeLeases().map((lease) => lease.physicalWorldId)).size).toBe(25);
  });

  it("keeps shared instances separated and enforces visitor permissions", () => {
    const manager = new SharedInstanceLeaseManager(new CapacityController());
    const owner = manager.allocate(scope(1));
    const other = manager.allocate(scope(2));
    if (!owner.ok || !other.ok) throw new Error("Fixture allocation failed.");
    expect(owner.lease.physicalWorldId).toBe(other.lease.physicalWorldId);
    expect(owner.lease.instanceBounds).not.toEqual(other.lease.instanceBounds);
    expect(() =>
      manager.assertPositionInsideLease(
        owner.lease.leaseId,
        other.lease.instanceBounds?.minimumX ?? 0,
        other.lease.instanceBounds?.minimumZ ?? 0,
      ),
    ).toThrow(/crosses/);
    expect(manager.canEnter(owner.lease.leaseId, "student-02")).toBe(false);
    manager.approveVisitor(owner.lease.leaseId, "student-01", "student-02");
    expect(manager.canEnter(owner.lease.leaseId, "student-02")).toBe(true);
    expect(manager.canEdit(owner.lease.leaseId, "student-02")).toBe(false);
    expect(manager.releaseForOwnerDeparture(owner.lease.leaseId, "student-01")).toEqual({
      releasedLeaseId: owner.lease.leaseId,
      evictedVisitorIds: ["student-02"],
    });
    expect(manager.canEnter(owner.lease.leaseId, "student-02")).toBe(false);
  });

  it("closes admissions when a candidate hardware threshold is breached", () => {
    const capacity = new CapacityController();
    const overloaded = sample("separate-worlds", 25);
    overloaded.tickMs = 60;
    const report = buildStrategyBenchmarkReport({
      strategy: "separate-worlds",
      evidenceKind: "physical-paper",
      samples: [overloaded],
    });
    expect(capacity.observe(report)).toBe("closed");
    expect(capacity.canAcceptLease()).toBe(false);
    expect(new SeparateWorldLeaseManager(capacity).allocate(scope(1))).toMatchObject({
      ok: false,
      code: "capacity_closed",
    });
  });

  it("never accepts synthetic policy samples as physical capacity evidence", () => {
    const samples = Array.from({ length: 26 }, (_, count) =>
      sample("separate-worlds", count, count === 0 ? "baseline" : "steady"),
    );
    expect(
      buildStrategyBenchmarkReport({
        strategy: "separate-worlds",
        evidenceKind: "synthetic-policy-test",
        samples,
      }),
    ).toMatchObject({ accepted: false, maximumActiveStudents: 25, breaches: [] });
  });
});

class FaultDriver implements LoadScenarioDriver {
  readonly connected = new Map<string, PrivateWorldLease>();
  readonly disconnected: string[] = [];
  finished = false;
  recovered = false;
  workloadCalls = 0;

  prepare(): Promise<void> {
    return Promise.resolve();
  }

  connect(student: LoadScenarioStudent): Promise<PrivateWorldLease> {
    const lease: PrivateWorldLease = {
      leaseId: `lease-${student.studentId}`,
      strategy: "separate-worlds",
      scope: {
        organizationId: "org-one",
        locationId: "location-one",
        sessionId: "session-one",
        projectId: "sheep-city",
        ownerStudentId: student.studentId,
      },
      logicalWorldId: `logical-${student.studentId}`,
      physicalWorldId: `physical-${student.studentId}`,
      approvedVisitorIds: [],
      lifecycle: "active",
    };
    this.connected.set(student.studentId, lease);
    return Promise.resolve(lease);
  }

  deploy(): Promise<void> {
    return Promise.resolve();
  }

  executeSheepCityWorkload(): Promise<void> {
    this.workloadCalls += 1;
    if (this.workloadCalls === 4) return Promise.reject(new Error("Injected Paper crash."));
    return Promise.resolve();
  }

  openVisitor(): Promise<void> {
    return Promise.resolve();
  }

  collectSample(
    strategy: WorldStrategy,
    phase: BenchmarkSample["phase"],
    activeStudents: number,
  ): Promise<BenchmarkSample> {
    return Promise.resolve(sample(strategy, activeStudents, phase));
  }

  disconnect(student: LoadScenarioStudent): Promise<void> {
    this.connected.delete(student.studentId);
    this.disconnected.push(student.studentId);
    return Promise.resolve();
  }

  recover(): Promise<void> {
    this.recovered = true;
    return Promise.resolve();
  }

  finish(): Promise<void> {
    this.finished = true;
    return Promise.resolve();
  }
}

describe("25-student scenario cleanup", () => {
  it("defines all required phases, students, devices, and visitor pairs", () => {
    const plan = createTwentyFiveStudentPlan();
    expect(plan.students).toHaveLength(25);
    expect(new Set(plan.students.map((student) => student.deviceId)).size).toBe(25);
    expect(plan.phases).toEqual([
      "baseline",
      "join",
      "run",
      "steady",
      "visitor",
      "disconnect",
      "recovery",
    ]);
  });

  it("disconnects every connected student and invokes recovery after an injected crash", async () => {
    const driver = new FaultDriver();
    await expect(
      runTwentyFiveStudentScenario({
        strategy: "separate-worlds",
        driver,
        evidenceKind: "synthetic-policy-test",
      }),
    ).rejects.toMatchObject({ message: "Injected Paper crash.", cleanupFailures: 0 });
    expect(driver.connected.size).toBe(0);
    expect(driver.disconnected).toHaveLength(25);
    expect(driver.recovered).toBe(true);
    expect(driver.finished).toBe(true);
  });
});
