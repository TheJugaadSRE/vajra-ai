import { Event, Incident } from "../schema";

const CORRELATION_WINDOW_MINUTES = 15;
const TERMINAL_STATUSES = new Set(["RESOLVED", "CLOSED"]);

/**
 * Deterministic correlation: an event joins an existing incident if it's for
 * the same service+environment, that incident isn't already closed out, and
 * it's within the correlation window. This is intentionally simple (section 8
 * says "use AI only when correlation requires semantic reasoning") — most
 * real correlation is just "same service, recent, still open".
 */
export function findCorrelatedIncident(event: Event, openIncidents: Incident[]): Incident | null {
  const cutoff = Date.now() - CORRELATION_WINDOW_MINUTES * 60 * 1000;
  const candidates = openIncidents.filter(
    (incident) =>
      incident.service === event.service &&
      incident.environment === event.environment &&
      !TERMINAL_STATUSES.has(incident.status) &&
      new Date(incident.updated_at).getTime() >= cutoff
  );
  if (candidates.length === 0) return null;
  // Most recently updated matching incident wins.
  return candidates.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0];
}

const SEVERITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function maxSeverity(a: Event["severity"], b: Event["severity"]): Event["severity"] {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}
