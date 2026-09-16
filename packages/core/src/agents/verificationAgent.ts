import { Incident, VerificationResult } from "../schema";
import { ObservabilityProvider } from "../providers/observability";

const KEY_METRICS = ["http_5xx_rate", "p99_latency"];
/** A metric counts as recovered if it dropped to at most this fraction of its pre-remediation value. */
const RECOVERY_THRESHOLD_RATIO = 0.5;

/**
 * Never assume a remediation worked just because it ran (section 18). This
 * re-queries the same observability provider the Diagnosis Agent used and
 * compares before/after on the metrics that actually motivated the action.
 */
export class VerificationAgent {
  constructor(private observability: ObservabilityProvider) {}

  async verify(incident: Incident, metricsBefore: Record<string, number>): Promise<VerificationResult> {
    const afterPoints = await this.observability.getMetrics(incident.service, incident.environment, 5);
    const metrics_after: Record<string, number> = {};
    for (const point of afterPoints) metrics_after[point.metric] = point.value;

    const recoveredFlags = KEY_METRICS.map((metric) => {
      const before = metricsBefore[metric];
      const after = metrics_after[metric];
      if (before === undefined || after === undefined) return null;
      return after <= before * RECOVERY_THRESHOLD_RATIO;
    }).filter((v): v is boolean => v !== null);

    const status =
      recoveredFlags.length === 0
        ? "INCONCLUSIVE"
        : recoveredFlags.every(Boolean)
        ? "RECOVERED"
        : "NOT_RECOVERED";

    return {
      status,
      metrics_before: metricsBefore,
      metrics_after,
      checked_at: new Date().toISOString(),
    };
  }
}
