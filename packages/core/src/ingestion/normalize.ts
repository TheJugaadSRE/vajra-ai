import { randomUUID } from "crypto";
import { Event, RawAlert, RawAlertSchema, Severity } from "../schema";

const SEVERITY_MAP: Record<string, Severity> = {
  low: "low",
  medium: "medium",
  high: "high",
  critical: "critical",
  info: "low",
  warning: "medium",
  error: "high",
};

function normalizeSeverity(raw: string): Severity {
  return SEVERITY_MAP[raw.toLowerCase()] ?? "medium";
}

/** Turns an external alert payload (Dynatrace/Datadog/CloudWatch/webhook shape) into the internal Event schema. */
export function normalizeAlert(input: unknown): Event {
  const raw: RawAlert = RawAlertSchema.parse(input);
  return {
    event_id: `EVT-${randomUUID().slice(0, 8)}`,
    received_at: new Date().toISOString(),
    source: raw.source,
    event_type: raw.eventType,
    service: raw.service,
    environment: raw.environment,
    severity: normalizeSeverity(raw.severity),
    symptom: raw.alert,
    raw: raw as unknown as Record<string, unknown>,
  };
}
