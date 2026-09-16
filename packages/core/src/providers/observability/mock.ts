import { LogLine, MetricPoint, ObservabilityProvider, TraceSummary } from "./types";

type HealthState = "healthy" | "degraded";

/**
 * Deterministic, stateful mock so the demo tells a coherent story: metrics
 * are healthy until the orchestrator calls markDegraded() (when an incident
 * opens) and go back to healthy once markRecovered() is called (after a
 * remediation is executed) — mirroring a real before/after verification.
 */
export class MockObservabilityProvider implements ObservabilityProvider {
  name = "mock";
  private state = new Map<string, HealthState>();

  markDegraded(service: string, environment: string): void {
    this.state.set(`${service}:${environment}`, "degraded");
  }

  markRecovered(service: string, environment: string): void {
    this.state.set(`${service}:${environment}`, "healthy");
  }

  private healthOf(service: string, environment: string): HealthState {
    return this.state.get(`${service}:${environment}`) ?? "healthy";
  }

  async getMetrics(service: string, environment: string): Promise<MetricPoint[]> {
    const degraded = this.healthOf(service, environment) === "degraded";
    return [
      { metric: "http_5xx_rate", value: degraded ? 38.2 : 2.1, unit: "%" },
      { metric: "p99_latency", value: degraded ? 2700 : 420, unit: "ms" },
      { metric: "cpu_utilization", value: 47, unit: "%" },
      { metric: "db_connection_pool_available", value: degraded ? 2 : 48, unit: "connections" },
    ];
  }

  async queryLogs(service: string, environment: string): Promise<LogLine[]> {
    const degraded = this.healthOf(service, environment) === "degraded";
    if (!degraded) {
      return [{ timestamp: new Date().toISOString(), level: "INFO", message: `${service} operating normally` }];
    }
    return [
      { timestamp: new Date().toISOString(), level: "ERROR", message: `${service}: connection pool exhausted, timeout acquiring connection` },
      { timestamp: new Date().toISOString(), level: "ERROR", message: `${service}: upstream ${service}-db timeout after 5000ms` },
      { timestamp: new Date().toISOString(), level: "WARN", message: `${service}: connection pool size reduced from 50 to 10 in latest config` },
    ];
  }

  async getTrace(): Promise<TraceSummary | null> {
    return null;
  }
}
