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

export interface MetricHistoryPoint {
  minutes_ago: number;
  value: number;
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
  /** Recent history for one metric, oldest first, used by the Predictive Failure Engine to fit a trend. */
  getMetricHistory(service: string, environment: string, metric: string, windowMinutes: number): Promise<MetricHistoryPoint[]>;
}
