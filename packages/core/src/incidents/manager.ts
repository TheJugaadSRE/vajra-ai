import { randomUUID } from "crypto";
import { Event, Incident, TimelineEntry } from "../schema";
import { IncidentStore } from "../memory/incidentStore";
import { findCorrelatedIncident, maxSeverity } from "../correlation/engine";

function timelineEntry(stage: string, message: string, data?: Record<string, unknown>): TimelineEntry {
  return { timestamp: new Date().toISOString(), stage, actor: "system", message, data };
}

/**
 * Deduplicates/correlates incoming events into incidents before any AI
 * reasoning happens — per section 7, we should never spin up one investigation
 * per alert.
 */
export class IncidentManager {
  constructor(private store: IncidentStore) {}

  async ingest(event: Event): Promise<{ incident: Incident; isNew: boolean }> {
    const openIncidents = (await this.store.list()).filter(
      (i) => i.status !== "RESOLVED" && i.status !== "CLOSED"
    );
    const existing = findCorrelatedIncident(event, openIncidents);

    if (existing) {
      const updated: Incident = {
        ...existing,
        severity: maxSeverity(existing.severity, event.severity),
        symptoms: existing.symptoms.includes(event.symptom)
          ? existing.symptoms
          : [...existing.symptoms, event.symptom],
        correlated_event_ids: [...existing.correlated_event_ids, event.event_id],
        updated_at: new Date().toISOString(),
        timeline: [
          ...existing.timeline,
          timelineEntry("correlation", `Correlated new signal: "${event.symptom}" (${event.source})`, {
            event_id: event.event_id,
          }),
        ],
      };
      await this.store.save(updated);
      return { incident: updated, isNew: false };
    }

    const now = new Date().toISOString();
    const incident: Incident = {
      incident_id: `INC-${randomUUID().slice(0, 8).toUpperCase()}`,
      title: `${event.symptom} — ${event.service}`,
      service: event.service,
      environment: event.environment,
      severity: event.severity,
      status: "OPEN",
      symptoms: [event.symptom],
      correlated_event_ids: [event.event_id],
      created_at: now,
      updated_at: now,
      timeline: [
        timelineEntry("detection", `Incident created from signal: "${event.symptom}" (${event.source})`, {
          event_id: event.event_id,
        }),
      ],
      diagnosis: null,
      policy_decision: null,
      approval: null,
      execution: null,
      verification: null,
    };
    await this.store.save(incident);
    return { incident, isNew: true };
  }

  async appendTimeline(incidentId: string, stage: string, message: string, actor: TimelineEntry["actor"] = "system", data?: Record<string, unknown>): Promise<Incident> {
    const incident = await this.store.get(incidentId);
    if (!incident) throw new Error(`Incident not found: ${incidentId}`);
    const updated: Incident = {
      ...incident,
      updated_at: new Date().toISOString(),
      timeline: [...incident.timeline, { timestamp: new Date().toISOString(), stage, actor, message, data }],
    };
    await this.store.save(updated);
    return updated;
  }

  async updateStatus(incidentId: string, status: Incident["status"]): Promise<Incident> {
    const incident = await this.store.get(incidentId);
    if (!incident) throw new Error(`Incident not found: ${incidentId}`);
    const updated: Incident = { ...incident, status, updated_at: new Date().toISOString() };
    await this.store.save(updated);
    return updated;
  }

  async patch(incidentId: string, patch: Partial<Incident>): Promise<Incident> {
    const incident = await this.store.get(incidentId);
    if (!incident) throw new Error(`Incident not found: ${incidentId}`);
    const updated: Incident = { ...incident, ...patch, updated_at: new Date().toISOString() };
    await this.store.save(updated);
    return updated;
  }
}
