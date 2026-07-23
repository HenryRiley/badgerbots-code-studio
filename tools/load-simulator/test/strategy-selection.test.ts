import { describe, expect, it } from "vitest";
import {
  compareWorldStrategies,
  validateHardwareEvidence,
  type HardwareEvidence,
} from "../src/index.js";
import type { BenchmarkSample, WorldStrategy } from "@badgerbots/world-manager";

function evidence(strategy: WorldStrategy, overload = false): HardwareEvidence {
  const phases: BenchmarkSample["phase"][] = [
    "baseline",
    "join",
    "run",
    "steady",
    "visitor",
    "disconnect",
    "recovery",
  ];
  const samples: BenchmarkSample[] = [];
  for (let activeStudents = 0; activeStudents <= 25; activeStudents += 1)
    for (const phase of phases)
      samples.push({
        schemaVersion: 1,
        strategy,
        phase,
        activeStudents,
        measuredAt: "2026-07-23T18:00:00.000Z",
        processResidentMiB: 4_096,
        heapUsedMiB: 3_072,
        cpuPercent: 45,
        tickMs: overload ? 60 : 25,
        tps: overload ? 18 : 20,
        chunkLoadMs: 250,
        chunkUnloadMs: 200,
        runLatencyMs: 180,
        teacherResponseMs: 80,
        entityCount: 500,
        diskMiB: 1_024,
      });
  return {
    schemaVersion: 1,
    evidenceKind: "physical-paper",
    strategy,
    recordedAt: "2026-07-23T18:30:00.000Z",
    machineId: "machine-one",
    benchmarkRunId: "benchmark-one",
    gitCommit: "85929fa",
    operatingSystem: "Windows 10 x64",
    cpuModel: "Intel Core i5 test fixture",
    totalRamMiB: 16_384,
    javaVersion: "21.0.8",
    paperBuild: "1.21.11-test",
    paperSha256: "a".repeat(64),
    pluginSha256: "b".repeat(64),
    viewDistance: 6,
    simulationDistance: 4,
    samples,
  };
}

describe("physical world strategy selection", () => {
  it("prefers separate worlds when both strategies pass", () => {
    expect(
      compareWorldStrategies([evidence("separate-worlds"), evidence("shared-instances")]),
    ).toMatchObject({
      status: "selected",
      selectedStrategy: "separate-worlds",
      supportedStudentCount: 25,
    });
  });

  it("selects shared instances only when separate worlds fail", () => {
    expect(
      compareWorldStrategies([evidence("separate-worlds", true), evidence("shared-instances")]),
    ).toMatchObject({
      status: "selected",
      selectedStrategy: "shared-instances",
      supportedStudentCount: 25,
    });
  });

  it("refuses selection without evidence for both strategies", () => {
    expect(compareWorldStrategies([evidence("separate-worlds")])).toMatchObject({
      status: "insufficient-evidence",
      supportedStudentCount: 0,
    });
  });

  it("rejects evidence below the supported memory envelope", () => {
    const invalid = evidence("separate-worlds");
    invalid.totalRamMiB = 8_192;
    expect(() => validateHardwareEvidence(invalid)).toThrow(/minimum RAM/);
  });

  it("refuses to compare results from different physical test runs", () => {
    const shared = evidence("shared-instances");
    shared.machineId = "machine-two";
    expect(() => compareWorldStrategies([evidence("separate-worlds"), shared])).toThrow(
      /same machine/,
    );
  });
});
