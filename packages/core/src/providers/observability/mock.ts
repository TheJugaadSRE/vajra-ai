import { LogLine, MetricHistoryPoint, MetricPoint, ObservabilityProvider, TraceSummary } from "./types";

type HealthState = "healthy" | "degraded";

const STABLE_BASELINES: Record<string, number> = {
  http_5xx_rate: 2.1,
  p99_latency: 420,
  cpu_utilization: 47,
  db_connection_pool_available: 48,
};

/** Deterministic pseudo-jitter (no Math.random) so history/tests are reproducible. */
function jitter(seed: number, amplitude: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2 * amplitude;
}

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

  /**
   * Every service/metric returns a flat, stable history EXCEPT
   * payment-service's db_connection_pool_available, which drains roughly
   * linearly — a slow connection leak, one of payment-service's documented
   * known_failure_modes (data/knowledge/services/payment-service.json) — so
   * the Predictive Failure Engine has a real trend to catch before it
   * becomes an incident.
   */
  async getMetricHistory(service: string, _environment: string, metric: string, windowMinutes: number): Promise<MetricHistoryPoint[]> {
    const isLeakScenario = service === "payment-service" && metric === "db_connection_pool_available";
    const stepMinutes = Math.max(1, Math.round(windowMinutes / 12));
    const points: MetricHistoryPoint[] = [];

    for (let elapsed = 0; elapsed <= windowMinutes; elapsed += stepMinutes) {
      const minutesAgo = windowMinutes - elapsed;
      let value: number;
      if (isLeakScenario) {
        const progress = elapsed / windowMinutes;
        const startingPool = 50;
        const drained = startingPool * 0.85 * progress;
        value = Math.max(1, Math.round(startingPool - drained + jitter(elapsed, 1)));
      } else {
        const baseline = STABLE_BASELINES[metric] ?? 0;
        value = Math.round((baseline + jitter(elapsed + metric.length, baseline * 0.04)) * 10) / 10;
      }
      points.push({ minutes_ago: minutesAgo, value });
    }
    return points;
  }
}
