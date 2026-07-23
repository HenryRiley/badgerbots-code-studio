package org.badgerbots.studio.runtime;

public final class RuntimeCircuitBreakerException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  private final String code;
  private final String sourceNodeId;

  public RuntimeCircuitBreakerException(String code, String sourceNodeId) {
    super("Runtime circuit breaker " + code + " at " + sourceNodeId + '.');
    this.code = code;
    this.sourceNodeId = sourceNodeId;
  }

  public String code() {
    return code;
  }

  public String sourceNodeId() {
    return sourceNodeId;
  }
}
