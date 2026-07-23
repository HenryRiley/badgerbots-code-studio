package org.badgerbots.studio.runtime;

import java.util.List;

public record ScopeKey(
    String organizationId,
    String locationId,
    String sessionId,
    String projectId,
    String studentId,
    String programVersionId,
    String worldId) {
  public ScopeKey {
    for (String value : List.of(
        organizationId,
        locationId,
        sessionId,
        projectId,
        studentId,
        programVersionId,
        worldId)) {
      if (value == null || value.isBlank()) {
        throw new IllegalArgumentException("Execution scope identifiers must not be blank.");
      }
    }
  }

  public String activeProgramKey() {
    return String.join(
        "\u001f", organizationId, locationId, sessionId, projectId, studentId, worldId);
  }
}
