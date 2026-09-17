import { fitLinearTrend, forecastBreach } from "../src/prediction/forecast";
import { MetricHistoryPoint } from "../src/providers/observability";

function decliningSeries(): MetricHistoryPoint[] {
  // 50 -> ~7.5 over 30 minutes, oldest first is minutes_ago=30, newest is minutes_ago=0
  const points: MetricHistoryPoint[] = [];
  for (let minutesAgo = 30; minutesAgo >= 0; minutesAgo -= 5) {
    const elapsed = 30 - minutesAgo;
    points.push({ minutes_ago: minutesAgo, value: 50 - elapsed * 1.4 });
  }
  return points;
}

function flatSeries(): MetricHistoryPoint[] {
  return [
    { minutes_ago: 30, value: 47 },
    { minutes_ago: 20, value: 47.2 },
    { minutes_ago: 10, value: 46.8 },
    { minutes_ago: 0, value: 47.1 },
  ];
}

describe("fitLinearTrend", () => {
  it("detects a clear declining trend with high R²", () => {
    const fit = fitLinearTrend(decliningSeries());
    expect(fit.slope).toBeLessThan(0);
    expect(fit.r_squared).toBeGreaterThan(0.9);
  });

  it("finds ~zero slope for a flat series", () => {
    const fit = fitLinearTrend(flatSeries());
    expect(Math.abs(fit.slope)).toBeLessThan(0.1);
  });
});

describe("forecastBreach", () => {
  it("projects a future breach when the trend is moving toward the threshold", () => {
    const fit = fitLinearTrend(decliningSeries());
    const forecast = forecastBreach(fit, 8, 5, "decreasing");
    expect(forecast.minutes_until_breach).not.toBeNull();
    expect(forecast.minutes_until_breach!).toBeGreaterThan(0);
    expect(forecast.confidence).toBe("high");
  });

  it("returns null when the trend is moving away from the threshold", () => {
    const fit = fitLinearTrend(decliningSeries());
    // Direction "increasing" means we only care about upward trends toward the threshold — this one is declining.
    const forecast = forecastBreach(fit, 8, 90, "increasing");
    expect(forecast.minutes_until_breach).toBeNull();
  });

  it("reports zero minutes when already past the threshold", () => {
    const fit = fitLinearTrend(flatSeries());
    const forecast = forecastBreach(fit, 3, 5, "decreasing");
    expect(forecast.minutes_until_breach).toBe(0);
  });
});
