import { z } from "zod";

/**
 * Predictive Failure Engine output. This is a statistical trend extrapolation
 * (linear regression over recent metric history) — NOT a trained ML model,
 * and fit_r_squared/confidence describe how well the trend fits observed
 * data, not a probability of an actual future outage. Labeled as such
 * everywhere it's surfaced.
 */
export const PredictionStatusSchema = z.enum(["MONITORING", "WARNING", "INVESTIGATING", "DISMISSED"]);
export type PredictionStatus = z.infer<typeof PredictionStatusSchema>;

export const PredictionSchema = z.object({
  prediction_id: z.string(),
  service: z.string(),
  environment: z.string(),
  metric: z.string(),
  current_value: z.number(),
  threshold: z.number(),
  direction: z.enum(["increasing", "decreasing"]),
  trend_slope_per_minute: z.number(),
  fit_r_squared: z.number(),
  confidence: z.enum(["low", "medium", "high"]),
  minutes_until_breach: z.number().nullable(),
  predicted_breach_at: z.string().nullable(),
  status: PredictionStatusSchema,
  description: z.string(),
  linked_incident_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Prediction = z.infer<typeof PredictionSchema>;
