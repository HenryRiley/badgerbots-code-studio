import type { BenchmarkSample, StrategyBenchmarkReport } from "./capacity.js";
import { buildStrategyBenchmarkReport } from "./capacity.js";
import type { PrivateWorldLease, WorldStrategy } from "./leases.js";

export interface LoadScenarioStudent {
  studentId: string;
  deviceId: string;
  programVersionId: string;
}

export interface LoadScenarioPlan {
  schemaVersion: 1;
  scenarioId: string;
  studentCount: 25;
  visitors: { ownerStudentId: string; visitorStudentId: string }[];
  students: LoadScenarioStudent[];
  phases: BenchmarkSample["phase"][];
}

export interface LoadScenarioDriver {
  prepare(strategy: WorldStrategy, plan: LoadScenarioPlan): Promise<void>;
  connect(student: LoadScenarioStudent): Promise<PrivateWorldLease>;
  deploy(student: LoadScenarioStudent, lease: PrivateWorldLease): Promise<void>;
  executeSheepCityWorkload(student: LoadScenarioStudent, lease: PrivateWorldLease): Promise<void>;
  openVisitor(
    owner: LoadScenarioStudent,
    visitor: LoadScenarioStudent,
    ownerLease: PrivateWorldLease,
  ): Promise<void>;
  collectSample(
    strategy: WorldStrategy,
    phase: BenchmarkSample["phase"],
    activeStudents: number,
  ): Promise<BenchmarkSample>;
  disconnect(student: LoadScenarioStudent, lease: PrivateWorldLease): Promise<void>;
  recover(): Promise<void>;
  finish(): Promise<void>;
}

export class LoadScenarioFailure extends Error {
  constructor(
    message: string,
    readonly cleanupFailures: number,
  ) {
    super(message);
  }
}

export function createTwentyFiveStudentPlan(
  scenarioId = "sheep-city-capacity-25",
): LoadScenarioPlan {
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(scenarioId))
    throw new Error("Load scenario ID must be an opaque lowercase identifier.");
  const students = Array.from({ length: 25 }, (_, index) => {
    const sequence = String(index + 1).padStart(2, "0");
    return {
      studentId: `student-${sequence}`,
      deviceId: `device-${sequence}`,
      programVersionId: `program-version-${sequence}`,
    };
  });
  return {
    schemaVersion: 1,
    scenarioId,
    studentCount: 25,
    visitors: [
      { ownerStudentId: "student-01", visitorStudentId: "student-02" },
      { ownerStudentId: "student-03", visitorStudentId: "student-04" },
    ],
    students,
    phases: ["baseline", "join", "run", "steady", "visitor", "disconnect", "recovery"],
  };
}

export async function runTwentyFiveStudentScenario(input: {
  strategy: WorldStrategy;
  driver: LoadScenarioDriver;
  evidenceKind: StrategyBenchmarkReport["evidenceKind"];
  plan?: LoadScenarioPlan;
}): Promise<StrategyBenchmarkReport> {
  const plan = input.plan ?? createTwentyFiveStudentPlan();
  if (plan.studentCount !== 25 || plan.students.length !== 25)
    throw new Error("Checkpoint 7 load scenarios require exactly 25 simulated students.");
  const leases = new Map<string, PrivateWorldLease>();
  const connectedStudentIds = new Set<string>();
  const samples: BenchmarkSample[] = [];
  let primaryError: unknown;
  let recovered = false;
  let cleanupFailures = 0;
  try {
    await input.driver.prepare(input.strategy, plan);
    samples.push(await input.driver.collectSample(input.strategy, "baseline", 0));
    for (const [index, student] of plan.students.entries()) {
      const lease = await input.driver.connect(student);
      leases.set(student.studentId, lease);
      connectedStudentIds.add(student.studentId);
      samples.push(await input.driver.collectSample(input.strategy, "join", index + 1));
    }
    for (const student of plan.students) {
      const lease = requireLease(leases, student.studentId);
      await input.driver.deploy(student, lease);
      await input.driver.executeSheepCityWorkload(student, lease);
      samples.push(await input.driver.collectSample(input.strategy, "run", 25));
    }
    samples.push(await input.driver.collectSample(input.strategy, "steady", 25));
    for (const visit of plan.visitors) {
      const owner = requireStudent(plan, visit.ownerStudentId);
      const visitor = requireStudent(plan, visit.visitorStudentId);
      await input.driver.openVisitor(owner, visitor, requireLease(leases, owner.studentId));
      samples.push(await input.driver.collectSample(input.strategy, "visitor", 25));
    }
    for (const [index, student] of [...plan.students].reverse().entries()) {
      await input.driver.disconnect(student, requireLease(leases, student.studentId));
      connectedStudentIds.delete(student.studentId);
      samples.push(await input.driver.collectSample(input.strategy, "disconnect", 24 - index));
    }
    await input.driver.recover();
    recovered = true;
    samples.push(await input.driver.collectSample(input.strategy, "recovery", 0));
  } catch (error) {
    primaryError = error;
  } finally {
    for (const student of [...plan.students].reverse()) {
      if (!connectedStudentIds.has(student.studentId)) continue;
      try {
        await input.driver.disconnect(student, requireLease(leases, student.studentId));
      } catch {
        cleanupFailures += 1;
      }
    }
    if (!recovered) {
      try {
        await input.driver.recover();
      } catch {
        cleanupFailures += 1;
      }
    }
    try {
      await input.driver.finish();
    } catch {
      cleanupFailures += 1;
    }
  }
  if (primaryError !== undefined)
    throw new LoadScenarioFailure(
      primaryError instanceof Error ? primaryError.message : "Load scenario failed.",
      cleanupFailures,
    );
  if (cleanupFailures > 0)
    throw new LoadScenarioFailure("Load scenario cleanup failed.", cleanupFailures);
  return buildStrategyBenchmarkReport({
    strategy: input.strategy,
    evidenceKind: input.evidenceKind,
    samples,
  });
}

function requireLease(
  leases: Map<string, PrivateWorldLease>,
  studentId: string,
): PrivateWorldLease {
  const lease = leases.get(studentId);
  if (!lease) throw new Error(`Load scenario lease is missing for ${studentId}.`);
  return lease;
}

function requireStudent(plan: LoadScenarioPlan, studentId: string): LoadScenarioStudent {
  const student = plan.students.find((candidate) => candidate.studentId === studentId);
  if (!student) throw new Error(`Load scenario student is missing: ${studentId}.`);
  return student;
}
