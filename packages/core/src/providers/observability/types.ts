export interface MetricPoint {
  metric: string;
  value: number;
  unit: string;
}

export interface LogLine {
  timestamp: string;
  level: string;
  message: string;
}

export interface TraceSummary {
  trace_id: string;
  spans: { service: string; duration_ms: number; status: string }[];
}

/**
 * Everything VAJRA needs from an observability backend. Dynatrace/CloudWatch
 * implementations are Phase 2 — see DynatraceObservabilityProvider /
 * CloudWatchObservabilityProvider below.
 */
export interface ObservabilityProvider {
  name: string;
  getMetrics(service: string, environment: string, sinceMinutes: number): Promise<MetricPoint[]>;
  queryLogs(service: string, environment: string, query: string): Promise<LogLine[]>;
  getTrace(service: string, environment: string): Promise<TraceSummary | null>;
}
