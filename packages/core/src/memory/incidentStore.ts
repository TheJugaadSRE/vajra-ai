import fs from "fs";
import path from "path";
import { Incident } from "../schema";

export interface SimilarIncident {
  incident_id: string;
  similarity: "high" | "medium" | "low";
  service: string;
  resolution: string | null;
}

export interface IncidentStore {
  save(incident: Incident): Promise<void>;
  get(incidentId: string): Promise<Incident | null>;
  list(): Promise<Incident[]>;
  findSimilar(incident: Incident): Promise<SimilarIncident[]>;
}

/**
 * In-memory + JSON-file-backed store for local development. The AWS design
 * (infra/cdk) uses a single-table DynamoDB store with the same interface —
 * see docs/architecture.md.
 */
export class JsonFileIncidentStore implements IncidentStore {
  private incidents = new Map<string, Incident>();
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(process.cwd(), ".data", "incidents.json");
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.filePath)) {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as Incident[];
      for (const incident of raw) this.incidents.set(incident.incident_id, incident);
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(Array.from(this.incidents.values()), null, 2));
  }

  async save(incident: Incident): Promise<void> {
    this.incidents.set(incident.incident_id, incident);
    this.persist();
  }

  async get(incidentId: string): Promise<Incident | null> {
    return this.incidents.get(incidentId) ?? null;
  }

  async list(): Promise<Incident[]> {
    return Array.from(this.incidents.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  /** Naive tag-overlap similarity: same service + shared symptom keywords, resolved incidents only. */
  async findSimilar(incident: Incident): Promise<SimilarIncident[]> {
    const symptomWords = new Set(
      incident.symptoms.join(" ").toLowerCase().split(/\W+/).filter((w) => w.length > 3)
    );
    const results: SimilarIncident[] = [];
    for (const other of this.incidents.values()) {
      if (other.incident_id === incident.incident_id) continue;
      if (other.status !== "RESOLVED" && other.status !== "CLOSED") continue;
      if (other.service !== incident.service) continue;
      const otherWords = new Set(
        other.symptoms.join(" ").toLowerCase().split(/\W+/).filter((w) => w.length > 3)
      );
      const overlap = [...symptomWords].filter((w) => otherWords.has(w)).length;
      const similarity = overlap >= 3 ? "high" : overlap >= 1 ? "medium" : "low";
      if (overlap > 0) {
        results.push({
          incident_id: other.incident_id,
          similarity,
          service: other.service,
          resolution: other.diagnosis?.recommended_action.type ?? null,
        });
      }
    }
    return results;
  }
}
