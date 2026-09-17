import { Incident, VerificationResult } from "../schema";
import { ObservabilityProvider } from "../providers/observability";

/** A metric counts as healthy if it's at or below this absolute value after remediation. */
const HEALTHY_THRESHOLDS: Record<string, number> = {
  http_5xx_rate: 5,
  p99_latency: 1000,
};

/**
 * Never assume a remediation worked just because it ran (section 18). This
 * re-queries the same observability provider the Diagnosis Agent used and
 * checks whether the metrics that motivated the action are healthy now —
 * an absolute check, not "did it improve by X%", because a *proactive*
 * remediation (see prediction/predictiveEngine.ts) can correctly leave
 * already-healthy metrics unchanged and still count as a success.
 */
export class VerificationAgent {
  constructor(private observability: ObservabilityProvider) {}

  async verify(incident: Incident, metricsBefore: Record<string, number>): Promise<VerificationResult> {
    const afterPoints = await this.observability.getMetrics(incident.service, incident.environment, 5);
    const metrics_after: Record<string, number> = {};
    for (const point of afterPoints) metrics_after[point.metric] = point.value;

    const healthyFlags = Object.entries(HEALTHY_THRESHOLDS)
      .map(([metric, threshold]) => {
        const after = metrics_after[metric];
        if (after === undefined) return null;
        return after <= threshold;
      })
      .filter((v): v is boolean => v !== null);

    const status = healthyFlags.length === 0 ? "INCONCLUSIVE" : healthyFlags.every(Boolean) ? "RECOVERED" : "NOT_RECOVERED";

    return {
      status,
      metrics_before: metricsBefore,
      metrics_after,
      checked_at: new Date().toISOString(),
    };
  }
}
