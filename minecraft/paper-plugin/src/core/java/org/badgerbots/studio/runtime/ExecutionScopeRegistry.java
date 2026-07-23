package org.badgerbots.studio.runtime;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class ExecutionScopeRegistry {
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

  public synchronized void stop(ScopeKey key) {
    List<AutoCloseable> scoped = resources.remove(key);
    if (scoped == null) return;
    for (int index = scoped.size() - 1; index >= 0; index--) close(scoped.get(index));
  }

  public synchronized boolean isActive(ScopeKey key) {
    return resources.containsKey(key);
  }

  public synchronized void stopAll() {
    for (ScopeKey key : List.copyOf(resources.keySet())) stop(key);
  }

  private static void close(AutoCloseable resource) {
    try {
      resource.close();
    } catch (Exception exception) {
      throw new IllegalStateException("Scoped resource cancellation failed.", exception);
    }
  }
}
