import type { LeaseCapacityGate, WorldStrategy } from "./leases.js";

export interface BenchmarkThresholds {
  maximumProcessResidentMiB: number;
  maximumHeapUsedMiB: number;
  maximumCpuPercentP95: number;
  maximumTickMsP95: number;
  minimumTps: number;
  maximumChunkLoadMsP95: number;
  maximumChunkUnloadMsP95: number;
  maximumRunLatencyMsP95: number;
  maximumTeacherResponseMsP95: number;
  maximumEntityCount: number;
  maximumDiskMiB: number;
}

export const MINIMUM_HARDWARE_CANDIDATE_THRESHOLDS: BenchmarkThresholds = {
  maximumProcessResidentMiB: 10_240,
  maximumHeapUsedMiB: 8_192,
  maximumCpuPercentP95: 80,
  maximumTickMsP95: 45,
  minimumTps: 19.5,
  maximumChunkLoadMsP95: 2_000,
  maximumChunkUnloadMsP95: 2_000,
  maximumRunLatencyMsP95: 750,
  maximumTeacherResponseMsP95: 250,
  maximumEntityCount: 2_500,
  maximumDiskMiB: 8_192,
};

export interface BenchmarkSample {
  schemaVersion: 1;
  strategy: WorldStrategy;
  phase: "baseline" | "join" | "steady" | "run" | "visitor" | "disconnect" | "recovery";
  activeStudents: number;
  measuredAt: string;
  processResidentMiB: number;
  heapUsedMiB: number;
  cpuPercent: number;
  tickMs: number;
  tps: number;
  chunkLoadMs: number;
  chunkUnloadMs: number;
  runLatencyMs: number;
  teacherResponseMs: number;
  entityCount: number;
  diskMiB: number;
}

export interface StrategyBenchmarkReport {
  schemaVersion: 1;
  strategy: WorldStrategy;
  evidenceKind: "physical-paper" | "synthetic-policy-test";
  sampleCount: number;
  maximumActiveStudents: number;
  metrics: {
    maximumProcessResidentMiB: number;
    maximumHeapUsedMiB: number;
    cpuPercentP95: number;
    tickMsP95: number;
    minimumTps: number;
    chunkLoadMsP95: number;
    chunkUnloadMsP95: number;
    runLatencyMsP95: number;
    teacherResponseMsP95: number;
    maximumEntityCount: number;
    maximumDiskMiB: number;
  };
  breaches: string[];
  accepted: boolean;
}

export type CapacityState = "healthy" | "warning" | "closed";

const requiredBenchmarkPhases: BenchmarkSample["phase"][] = [
  "baseline",
  "join",
  "run",
  "steady",
  "visitor",
  "disconnect",
  "recovery",
];

function finiteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`Benchmark ${label} must be a finite non-negative number.`);
}

export function validateBenchmarkSample(sample: BenchmarkSample): void {
  if (sample.schemaVersion !== 1) throw new Error("Unsupported benchmark sample version.");
  if (sample.strategy !== "separate-worlds" && sample.strategy !== "shared-instances")
    throw new Error("Unsupported benchmark world strategy.");
  if (
    !Number.isInteger(sample.activeStudents) ||
    sample.activeStudents < 0 ||
    sample.activeStudents > 25
  )
    throw new Error("Benchmark activeStudents must be an integer from 0 to 25.");
  if (!Number.isFinite(Date.parse(sample.measuredAt)))
    throw new Error("Benchmark measuredAt must be an ISO timestamp.");
  for (const [label, value] of Object.entries(sample).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  ))
    finiteNonNegative(value, label);
  if (sample.tps > 20.1) throw new Error("Benchmark TPS exceeds the supported measurement range.");
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) throw new Error("Cannot calculate a percentile without samples.");
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? sorted.at(-1) ?? 0;
}

export function buildStrategyBenchmarkReport(input: {
  strategy: WorldStrategy;
  evidenceKind: StrategyBenchmarkReport["evidenceKind"];
  samples: BenchmarkSample[];
  thresholds?: BenchmarkThresholds;
}): StrategyBenchmarkReport {
  if (input.samples.length === 0) throw new Error("A benchmark report requires samples.");
  for (const sample of input.samples) {
    validateBenchmarkSample(sample);
    if (sample.strategy !== input.strategy)
      throw new Error("Benchmark report cannot mix world strategies.");
  }
  const thresholds = input.thresholds ?? MINIMUM_HARDWARE_CANDIDATE_THRESHOLDS;
  const metrics: StrategyBenchmarkReport["metrics"] = {
    maximumProcessResidentMiB: Math.max(
      ...input.samples.map((sample) => sample.processResidentMiB),
    ),
    maximumHeapUsedMiB: Math.max(...input.samples.map((sample) => sample.heapUsedMiB)),
    cpuPercentP95: percentile(
      input.samples.map((sample) => sample.cpuPercent),
      0.95,
    ),
    tickMsP95: percentile(
      input.samples.map((sample) => sample.tickMs),
      0.95,
    ),
    minimumTps: Math.min(...input.samples.map((sample) => sample.tps)),
    chunkLoadMsP95: percentile(
      input.samples.map((sample) => sample.chunkLoadMs),
      0.95,
    ),
    chunkUnloadMsP95: percentile(
      input.samples.map((sample) => sample.chunkUnloadMs),
      0.95,
    ),
    runLatencyMsP95: percentile(
      input.samples.map((sample) => sample.runLatencyMs),
      0.95,
    ),
    teacherResponseMsP95: percentile(
      input.samples.map((sample) => sample.teacherResponseMs),
      0.95,
    ),
    maximumEntityCount: Math.max(...input.samples.map((sample) => sample.entityCount)),
    maximumDiskMiB: Math.max(...input.samples.map((sample) => sample.diskMiB)),
  };
  const breaches: string[] = [];
  if (metrics.maximumProcessResidentMiB > thresholds.maximumProcessResidentMiB)
    breaches.push("process_resident_memory");
  if (metrics.maximumHeapUsedMiB > thresholds.maximumHeapUsedMiB) breaches.push("jvm_heap");
  if (metrics.cpuPercentP95 > thresholds.maximumCpuPercentP95) breaches.push("cpu");
  if (metrics.tickMsP95 > thresholds.maximumTickMsP95) breaches.push("tick_duration");
  if (metrics.minimumTps < thresholds.minimumTps) breaches.push("tps");
  if (metrics.chunkLoadMsP95 > thresholds.maximumChunkLoadMsP95) breaches.push("chunk_load");
  if (metrics.chunkUnloadMsP95 > thresholds.maximumChunkUnloadMsP95) breaches.push("chunk_unload");
  if (metrics.runLatencyMsP95 > thresholds.maximumRunLatencyMsP95) breaches.push("run_latency");
  if (metrics.teacherResponseMsP95 > thresholds.maximumTeacherResponseMsP95)
    breaches.push("teacher_responsiveness");
  if (metrics.maximumEntityCount > thresholds.maximumEntityCount) breaches.push("entity_count");
  if (metrics.maximumDiskMiB > thresholds.maximumDiskMiB) breaches.push("disk");
  const activeCounts = new Set(input.samples.map((sample) => sample.activeStudents));
  const hasEveryActiveCount = Array.from({ length: 26 }, (_, count) => count).every((count) =>
    activeCounts.has(count),
  );
  const hasEveryPhase = requiredBenchmarkPhases.every((phase) =>
    input.samples.some((sample) => sample.phase === phase),
  );
  return {
    schemaVersion: 1,
    strategy: input.strategy,
    evidenceKind: input.evidenceKind,
    sampleCount: input.samples.length,
    maximumActiveStudents: Math.max(...input.samples.map((sample) => sample.activeStudents)),
    metrics,
    breaches,
    accepted:
      input.evidenceKind === "physical-paper" &&
      breaches.length === 0 &&
      input.samples.length >= 80 &&
      hasEveryActiveCount &&
      hasEveryPhase,
  };
}

export class CapacityController implements LeaseCapacityGate {
  private state: CapacityState = "healthy";
  private reason = "Capacity measurements are within the candidate operating envelope.";

  observe(report: StrategyBenchmarkReport): CapacityState {
    if (report.breaches.length > 0) {
      this.state = "closed";
      this.reason = `New private worlds are paused: ${report.breaches.join(", ")} threshold exceeded.`;
      return this.state;
    }
    if (report.maximumActiveStudents < 25 || report.evidenceKind !== "physical-paper") {
      this.state = "warning";
      this.reason =
        "Capacity is unverified on the minimum Windows/Paper hardware; instructor confirmation is required.";
      return this.state;
    }
    this.state = "healthy";
    this.reason = "Capacity measurements are within the candidate operating envelope.";
    return this.state;
  }

  closeForOperationalFailure(reason: string): void {
    const trimmed = reason.trim();
    if (trimmed.length < 4 || trimmed.length > 240)
      throw new Error("Capacity failure reason must contain 4-240 characters.");
    this.state = "closed";
    this.reason = `New private worlds are paused: ${trimmed}`;
  }

  currentState(): CapacityState {
    return this.state;
  }

  canAcceptLease(): boolean {
    return this.state !== "closed";
  }

  refusalReason(): string {
    return this.reason;
  }
}
