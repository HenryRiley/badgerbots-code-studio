package org.badgerbots.studio.runtime;

public record RuntimeLimits(
    int maximumHandlers,
    int maximumInstructionsPerEvent,
    int maximumExplosionsPerEvent,
    int maximumItemDropsPerEvent,
    long maximumWallClockNanos) {
  public static RuntimeLimits sheepCity() {
    return new RuntimeLimits(8, 64, 1, 16, 25_000_000L);
  }
}
