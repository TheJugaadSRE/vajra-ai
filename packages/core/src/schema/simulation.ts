import { z } from "zod";

export const SimulationScenarioSchema = z.object({
  action: z.string(),
  predicted_error_rate: z.number(),
  predicted_latency_ms: z.number(),
  cost_impact: z.string(),
});
export type SimulationScenario = z.infer<typeof SimulationScenarioSchema>;

/**
 * Digital Twin simulation: a deterministic, heuristic before/after projection —
 * NOT a trained model or a real topology replica. It exists to show the
 * engineer likely outcomes of each candidate action before anything runs for
 * real, per the "simulate before you act" principle. Labeled as such in the UI.
 */
export const SimulationResultSchema = z.object({
  incident_id: z.string(),
  simulated_at: z.string(),
  baseline: z.object({ error_rate: z.number(), latency_ms: z.number() }),
  scenarios: z.array(SimulationScenarioSchema),
  recommended_scenario: z.string(),
});
export type SimulationResult = z.infer<typeof SimulationResultSchema>;
