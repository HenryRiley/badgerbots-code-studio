import {
  buildStrategyBenchmarkReport,
  createTwentyFiveStudentPlan,
  validateBenchmarkSample,
  type BenchmarkSample,
  type StrategyBenchmarkReport,
  type WorldStrategy,
} from "@badgerbots/world-manager";

export interface HardwareEvidence {
  schemaVersion: 1;
  evidenceKind: "physical-paper";
  strategy: WorldStrategy;
  recordedAt: string;
  machineId: string;
  benchmarkRunId: string;
  gitCommit: string;
  operatingSystem: "Windows 10 x64" | "Windows 11 x64";
  cpuModel: string;
  totalRamMiB: number;
  javaVersion: string;
  paperBuild: string;
  paperSha256: string;
  pluginSha256: string;
  viewDistance: number;
  simulationDistance: number;
  samples: BenchmarkSample[];
}

export interface StrategySelection {
  selectedStrategy?: WorldStrategy;
  supportedStudentCount: number;
  status: "selected" | "degraded-only" | "insufficient-evidence";
  reason: string;
  reports: StrategyBenchmarkReport[];
}

const sha256Pattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{7,40}$/;
const opaqueIdPattern = /^[a-z][a-z0-9-]{2,63}$/;

export function validateHardwareEvidence(evidence: HardwareEvidence): void {
  if (evidence.schemaVersion !== 1 || evidence.evidenceKind !== "physical-paper")
    throw new Error("Unsupported physical benchmark evidence version.");
  if (
    evidence.operatingSystem !== "Windows 10 x64" &&
    evidence.operatingSystem !== "Windows 11 x64"
  )
    throw new Error("Checkpoint 7 evidence must come from supported Windows x64.");
  if (!Number.isFinite(Date.parse(evidence.recordedAt)))
    throw new Error("Physical evidence recordedAt must be an ISO timestamp.");
  if (!opaqueIdPattern.test(evidence.machineId) || !opaqueIdPattern.test(evidence.benchmarkRunId))
    throw new Error("Physical evidence must identify its machine and benchmark run.");
  if (!commitPattern.test(evidence.gitCommit))
    throw new Error("Physical evidence must identify the exact Git commit.");
  if (evidence.cpuModel.trim().length < 3 || evidence.cpuModel.length > 160)
    throw new Error("Physical evidence CPU model is missing or too long.");
  if (!Number.isInteger(evidence.totalRamMiB) || evidence.totalRamMiB < 15_000)
    throw new Error("Physical evidence does not meet the 16 GB-class minimum RAM envelope.");
  if (evidence.javaVersion.trim() === "" || evidence.paperBuild.trim() === "")
    throw new Error("Physical evidence must record Java and Paper versions.");
  if (!sha256Pattern.test(evidence.paperSha256) || !sha256Pattern.test(evidence.pluginSha256))
    throw new Error("Physical evidence must record Paper and plugin SHA-256 checksums.");
  if (
    !Number.isInteger(evidence.viewDistance) ||
    evidence.viewDistance < 2 ||
    evidence.viewDistance > 10 ||
    !Number.isInteger(evidence.simulationDistance) ||
    evidence.simulationDistance < 2 ||
    evidence.simulationDistance > evidence.viewDistance
  )
    throw new Error("Physical evidence view/simulation distances are outside the safe range.");
  if (evidence.samples.length < 80)
    throw new Error("Physical evidence is missing required 25-student scenario samples.");
  for (const sample of evidence.samples) {
    validateBenchmarkSample(sample);
    if (sample.strategy !== evidence.strategy)
      throw new Error("Physical evidence cannot mix world strategies.");
  }
  const activeCounts = new Set(evidence.samples.map((sample) => sample.activeStudents));
  for (let count = 0; count <= 25; count += 1)
    if (!activeCounts.has(count))
      throw new Error(`Physical evidence has no sample at ${count} active students.`);
  for (const phase of createTwentyFiveStudentPlan().phases)
    if (!evidence.samples.some((sample) => sample.phase === phase))
      throw new Error(`Physical evidence is missing the ${phase} phase.`);
}

export function compareWorldStrategies(evidence: HardwareEvidence[]): StrategySelection {
  for (const entry of evidence) validateHardwareEvidence(entry);
  if (evidence.length > 1) {
    const [first, ...rest] = evidence;
    if (!first) throw new Error("Physical evidence is missing.");
    const sameTestEnvironment = rest.every(
      (entry) =>
        entry.machineId === first.machineId &&
        entry.benchmarkRunId === first.benchmarkRunId &&
        entry.gitCommit === first.gitCommit &&
        entry.operatingSystem === first.operatingSystem &&
        entry.cpuModel === first.cpuModel &&
        entry.totalRamMiB === first.totalRamMiB &&
        entry.javaVersion === first.javaVersion &&
        entry.paperBuild === first.paperBuild &&
        entry.paperSha256 === first.paperSha256 &&
        entry.pluginSha256 === first.pluginSha256 &&
        entry.viewDistance === first.viewDistance &&
        entry.simulationDistance === first.simulationDistance,
    );
    if (!sameTestEnvironment)
      throw new Error(
        "World strategies must be compared from the same machine, benchmark run, commit, and Paper configuration.",
      );
  }
  const reports = evidence.map((entry) =>
    buildStrategyBenchmarkReport({
      strategy: entry.strategy,
      evidenceKind: entry.evidenceKind,
      samples: entry.samples,
    }),
  );
  const byStrategy = new Map(reports.map((report) => [report.strategy, report]));
  const separate = byStrategy.get("separate-worlds");
  const shared = byStrategy.get("shared-instances");
  if (!separate || !shared)
    return {
      status: "insufficient-evidence",
      supportedStudentCount: 0,
      reason: "Both world strategies must run on the same supported hardware before selection.",
      reports,
    };
  if (separate.accepted)
    return {
      selectedStrategy: "separate-worlds",
      status: "selected",
      supportedStudentCount: 25,
      reason: "Separate unloadable worlds passed every candidate threshold and remain preferred.",
      reports,
    };
  if (shared.accepted)
    return {
      selectedStrategy: "shared-instances",
      status: "selected",
      supportedStudentCount: 25,
      reason:
        "Separate worlds exceeded the candidate envelope; shared instances passed all thresholds.",
      reports,
    };
  return {
    status: "degraded-only",
    supportedStudentCount: 0,
    reason:
      "Neither strategy supports 25 students inside the candidate envelope. A lower-enrollment benchmark is required before any supported count is claimed; privacy boundaries and quotas must not be weakened.",
    reports,
  };
}
