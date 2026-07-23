package org.badgerbots.studio.runtime;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class ExecutionScopeRegistry {
  public record StopResult(int cancelledResources, int cancellationFailures) {}

  private final Map<ScopeKey, List<AutoCloseable>> resources = new HashMap<>();

  public synchronized void create(ScopeKey key) {
    if (resources.putIfAbsent(key, new ArrayList<>()) != null) {
      throw new IllegalStateException("Execution scope already exists.");
    }
  }

  public synchronized void register(ScopeKey key, AutoCloseable resource) {
    List<AutoCloseable> scoped = resources.get(key);
    if (scoped == null) {
      close(resource);
      throw new IllegalStateException("Execution scope is not active.");
    }
    scoped.add(resource);
  }

  public synchronized StopResult stop(ScopeKey key) {
    List<AutoCloseable> scoped = resources.remove(key);
    if (scoped == null) return new StopResult(0, 0);
    int cancelled = 0;
    int failures = 0;
    for (int index = scoped.size() - 1; index >= 0; index--) {
      if (closeWithoutThrowing(scoped.get(index))) {
        cancelled++;
      } else {
        failures++;
      }
    }
    return new StopResult(cancelled, failures);
  }

  public synchronized boolean isActive(ScopeKey key) {
    return resources.containsKey(key);
  }

  public synchronized StopResult stopAll() {
    int cancelled = 0;
    int failures = 0;
    for (ScopeKey key : List.copyOf(resources.keySet())) {
      StopResult result = stop(key);
      cancelled += result.cancelledResources();
      failures += result.cancellationFailures();
    }
    return new StopResult(cancelled, failures);
  }

  public synchronized int activeScopeCount() {
    return resources.size();
  }

  public synchronized int registeredResourceCount() {
    return resources.values().stream().mapToInt(List::size).sum();
  }

  private static void close(AutoCloseable resource) {
    try {
      resource.close();
    } catch (Exception exception) {
      throw new IllegalStateException("Scoped resource cancellation failed.", exception);
    }
  }

  private static boolean closeWithoutThrowing(AutoCloseable resource) {
    try {
      resource.close();
      return true;
    } catch (Exception exception) {
      return false;
    }
  }
}
