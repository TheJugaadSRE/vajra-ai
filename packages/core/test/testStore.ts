import { Incident } from "../src/schema";
import { IncidentStore, SimilarIncident } from "../src/memory/incidentStore";

/** Pure in-memory IncidentStore for fast, isolated unit tests (no filesystem I/O). */
export class InMemoryIncidentStore implements IncidentStore {
  private incidents = new Map<string, Incident>();

  async save(incident: Incident): Promise<void> {
    this.incidents.set(incident.incident_id, incident);
  }

  async get(incidentId: string): Promise<Incident | null> {
    return this.incidents.get(incidentId) ?? null;
  }

  async list(): Promise<Incident[]> {
    return Array.from(this.incidents.values());
  }

  async findSimilar(): Promise<SimilarIncident[]> {
    return [];
  }
}
