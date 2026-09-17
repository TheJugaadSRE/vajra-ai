import { MetricHistoryPoint } from "../providers/observability";

export interface LinearFit {
  slope: number;
  intercept: number;
  r_squared: number;
}

/**
 * Ordinary least-squares linear regression: value = slope * minutes_elapsed + intercept,
 * where minutes_elapsed counts up from the oldest point (so a positive slope
 * means "increasing over time" in real chronological order regardless of how
 * minutes_ago was ordered on the way in).
 */
export function fitLinearTrend(history: MetricHistoryPoint[]): LinearFit {
  if (history.length < 2) return { slope: 0, intercept: history[0]?.value ?? 0, r_squared: 0 };

  const sorted = [...history].sort((a, b) => b.minutes_ago - a.minutes_ago); // oldest first
  const maxAgo = sorted[0].minutes_ago;
  const points = sorted.map((p) => ({ x: maxAgo - p.minutes_ago, y: p.value }));

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  const ssXY = points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
  const ssXX = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;

  const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r_squared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, r_squared };
}

export interface BreachForecast {
  minutes_until_breach: number | null;
  confidence: "low" | "medium" | "high";
}

/**
 * Given a fitted trend and a threshold, project how many minutes until the
 * metric crosses it — null if the trend isn't moving toward the threshold at
 * all. Confidence is derived from fit quality (R²) only; it says nothing
 * about the real-world probability of an actual outage.
 */
export function forecastBreach(fit: LinearFit, currentValue: number, threshold: number, direction: "increasing" | "decreasing"): BreachForecast {
  const movingTowardBreach = direction === "increasing" ? fit.slope > 0 : fit.slope < 0;
  const alreadyBreached = direction === "increasing" ? currentValue >= threshold : currentValue <= threshold;

  if (alreadyBreached) return { minutes_until_breach: 0, confidence: confidenceFromFit(fit.r_squared) };
  if (!movingTowardBreach || fit.slope === 0) return { minutes_until_breach: null, confidence: "low" };

  const minutesUntilBreach = (threshold - currentValue) / fit.slope;
  if (minutesUntilBreach <= 0 || !Number.isFinite(minutesUntilBreach)) {
    return { minutes_until_breach: null, confidence: "low" };
  }

  return { minutes_until_breach: Math.round(minutesUntilBreach), confidence: confidenceFromFit(fit.r_squared) };
}

function confidenceFromFit(r_squared: number): "low" | "medium" | "high" {
  if (r_squared >= 0.8) return "high";
  if (r_squared >= 0.5) return "medium";
  return "low";
}
