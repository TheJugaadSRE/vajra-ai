import { DiagnosisResult, Incident, SimulationResult } from "../schema";

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Digital Twin simulation — a deterministic, explainable heuristic model, NOT
 * a trained model or a live replica of the real topology. It projects how
 * each candidate action would plausibly affect the two metrics the incident
 * was diagnosed from, so an engineer can compare options before anything
 * executes for real. Always labeled "simulated projection" in the UI.
 */
function project(actionType: string, errorRate: number, latencyMs: number): { predicted_error_rate: number; predicted_latency_ms: number; cost_impact: string } {
  switch (actionType) {
    case "rollback_deployment":
      return { predicted_error_rate: round(errorRate * 0.05), predicted_latency_ms: round(latencyMs * 0.15), cost_impact: "none — redeploys previous known-good version" };
    case "restart_service":
      return { predicted_error_rate: round(errorRate * 0.8), predicted_latency_ms: round(latencyMs * 0.9), cost_impact: "brief availability dip during restart" };
    case "scale_service":
      return { predicted_error_rate: round(errorRate * 0.6), predicted_latency_ms: round(latencyMs * 0.7), cost_impact: "+infra cost for additional replicas while scaled" };
    case "block_traffic":
      return { predicted_error_rate: round(errorRate * 0.3), predicted_latency_ms: round(latencyMs * 0.9), cost_impact: "none — blocks malicious IPs at the edge" };
    case "no_action":
    default:
      return { predicted_error_rate: errorRate, predicted_latency_ms: latencyMs, cost_impact: "none" };
  }
}

export function simulateAction(incident: Incident, diagnosis: DiagnosisResult): SimulationResult {
  const errorRate = diagnosis.baseline_metrics.http_5xx_rate ?? 0;
  const latencyMs = diagnosis.baseline_metrics.p99_latency ?? 0;

  const candidateTypes = Array.from(
    new Set([diagnosis.recommended_action.type, "restart_service", "scale_service", "no_action"])
  );

  const scenarios = candidateTypes.map((action) => ({ action, ...project(action, errorRate, latencyMs) }));
  const recommended = scenarios.reduce((best, s) => (s.predicted_error_rate < best.predicted_error_rate ? s : best), scenarios[0]);

  return {
    incident_id: incident.incident_id,
    simulated_at: new Date().toISOString(),
    baseline: { error_rate: errorRate, latency_ms: latencyMs },
    scenarios,
    recommended_scenario: recommended.action,
  };
}
