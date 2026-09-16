import { LogLine, MetricPoint, ObservabilityProvider, TraceSummary } from "./types";

/**
 * Phase 2 integration points. Implement `getMetrics`/`queryLogs`/`getTrace`
 * against the real API and these become drop-in replacements for
 * MockObservabilityProvider — nothing else in the codebase needs to change.
 */
class NotImplementedObservabilityProvider implements ObservabilityProvider {
  constructor(public name: string) {}

  async getMetrics(): Promise<MetricPoint[]> {
    throw new Error(`${this.name} integration not implemented yet (Phase 2)`);
  }

  async queryLogs(): Promise<LogLine[]> {
    throw new Error(`${this.name} integration not implemented yet (Phase 2)`);
  }

  async getTrace(): Promise<TraceSummary | null> {
    throw new Error(`${this.name} integration not implemented yet (Phase 2)`);
  }
}

export class DynatraceObservabilityProvider extends NotImplementedObservabilityProvider {
  constructor() {
    super("dynatrace");
  }
}

export class CloudWatchObservabilityProvider extends NotImplementedObservabilityProvider {
  constructor() {
    super("cloudwatch");
  }
}
