import { z } from "zod";

export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Shape of an alert as it arrives from an external system (Dynatrace, Datadog,
 * CloudWatch, a custom webhook, ...). This is intentionally loose — normalize.ts
 * is responsible for turning this into the internal Event schema below.
 */
export const RawAlertSchema = z.object({
  eventType: z.string(),
  service: z.string(),
  environment: z.string(),
  severity: z.string(),
  timestamp: z.string().optional(),
  alert: z.string(),
  source: z.string(),
  metadata: z.record(z.unknown()).optional(),
});
export type RawAlert = z.infer<typeof RawAlertSchema>;

/** Internal, normalized event schema. Everything downstream operates on this. */
export const EventSchema = z.object({
  event_id: z.string(),
  received_at: z.string(),
  source: z.string(),
  event_type: z.string(),
  service: z.string(),
  environment: z.string(),
  severity: SeveritySchema,
  symptom: z.string(),
  raw: z.record(z.unknown()),
});
export type Event = z.infer<typeof EventSchema>;
