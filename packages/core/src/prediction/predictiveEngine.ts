import { Prediction } from "../schema";
import { ObservabilityProvider } from "../providers/observability";
import { fitLinearTrend, forecastBreach } from "./forecast";

export interface ServiceTarget {
  service: string;
  environment: string;
}

interface WatchedMetric {
  metric: string;
  threshold: number;
  direction: "increasing" | "decreasing";
  description: string;
}

const HISTORY_WINDOW_MINUTES = 30;
/** Only surface predictions expected to breach within this horizon — a forecast 6 hours out isn't actionable. */
const HORIZON_MINUTES = 90;

const WATCHED_METRICS: WatchedMetric[] = [
  { metric: "db_connection_pool_available", threshold: 5, direction: "decreasing", description: "connection pool exhaustion" },
  { metric: "cpu_utilization", threshold: 90, direction: "increasing", description: "CPU saturation" },
  { metric: "http_5xx_rate", threshold: 20, direction: "increasing", description: "elevated error rate" },
];

function addMinutesIso(minutes: number | null): string | null {
  return minutes === null ? null : new Date(Date.now() + minutes * 60_000).toISOString();
}

function predictionId(target: ServiceTarget, metric: string): string {
  return `PRED-${target.service}-${target.environment}-${metric}`.toUpperCase().replace(/[^A-Z0-9-]/g, "-");
}

/**
 * Predictive Failure Engine: fits a linear trend to recent metric history per
 * watched metric/service and forecasts whether it crosses a threshold within
 * the horizon. This is statistical trend extrapolation on the same (mock)
 * observability data everything else uses — not a trained model, and it
 * makes no claim about real-world outage probability. Confidence reflects
 * only how well the line fits the recent points (R²).
 */
export class PredictiveEngine {
  private predictions = new Map<string, Prediction>();

  constructor(private observability: ObservabilityProvider) {}

  /**
   * Seeds in-memory state from persisted predictions — needed anywhere this
   * engine doesn't live in one long-running process (e.g. a scheduled AWS
   * Lambda, where each invocation is a fresh container with no memory of the
   * last run). Local dev's single Express process doesn't need this.
   */
  hydrate(predictions: Prediction[]): void {
    for (const prediction of predictions) this.predictions.set(prediction.prediction_id, prediction);
  }

  async scan(targets: ServiceTarget[]): Promise<Prediction[]> {
    for (const target of targets) {
      for (const watched of WATCHED_METRICS) {
        await this.evaluate(target, watched);
      }
    }
    return this.list();
  }

  private async evaluate(target: ServiceTarget, watched: WatchedMetric): Promise<void> {
    const id = predictionId(target, watched.metric);
    const history = await this.observability.getMetricHistory(target.service, target.environment, watched.metric, HISTORY_WINDOW_MINUTES);
    if (history.length < 2) return;

    const current = history.reduce((min, p) => (p.minutes_ago < min.minutes_ago ? p : min), history[0]);
    const fit = fitLinearTrend(history);
    const forecast = forecastBreach(fit, current.value, watched.threshold, watched.direction);

    const existing = this.predictions.get(id);
    const withinHorizon = forecast.minutes_until_breach !== null && forecast.minutes_until_breach <= HORIZON_MINUTES;

    if (!withinHorizon) {
      // A record the human is actively tracking (investigating/dismissed) stays put even if the
      // trend momentarily looks better; an auto-created WARNING that's no longer trending is stale, drop it.
      if (existing && existing.status === "WARNING") this.predictions.delete(id);
      return;
    }

    const now = new Date().toISOString();
    const refreshedNumbers = {
      current_value: current.value,
      trend_slope_per_minute: fit.slope,
      fit_r_squared: fit.r_squared,
      confidence: forecast.confidence,
      minutes_until_breach: forecast.minutes_until_breach,
      predicted_breach_at: addMinutesIso(forecast.minutes_until_breach),
      updated_at: now,
    };

    if (existing && (existing.status === "INVESTIGATING" || existing.status === "DISMISSED")) {
      this.predictions.set(id, { ...existing, ...refreshedNumbers });
      return;
    }

    this.predictions.set(id, {
      prediction_id: id,
      service: target.service,
      environment: target.environment,
      metric: watched.metric,
      threshold: watched.threshold,
      direction: watched.direction,
      status: "WARNING",
      description: `${target.service} ${watched.metric} trending toward ${watched.description} in ~${forecast.minutes_until_breach} min`,
      linked_incident_id: existing?.linked_incident_id ?? null,
      created_at: existing?.created_at ?? now,
      ...refreshedNumbers,
    });
  }

  list(): Prediction[] {
    return Array.from(this.predictions.values());
  }

  get(predictionId: string): Prediction | null {
    return this.predictions.get(predictionId) ?? null;
  }

  linkIncident(id: string, incidentId: string): Prediction {
    const pred = this.mustGet(id);
    const updated: Prediction = { ...pred, status: "INVESTIGATING", linked_incident_id: incidentId, updated_at: new Date().toISOString() };
    this.predictions.set(id, updated);
    return updated;
  }

  dismiss(id: string): Prediction {
    const pred = this.mustGet(id);
    const updated: Prediction = { ...pred, status: "DISMISSED", updated_at: new Date().toISOString() };
    this.predictions.set(id, updated);
    return updated;
  }

  private mustGet(id: string): Prediction {
    const pred = this.get(id);
    if (!pred) throw new Error(`Prediction not found: ${id}`);
    return pred;
  }
}
