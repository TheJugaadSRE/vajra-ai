import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { Incident } from "../schema";
import { IncidentStore, SimilarIncident } from "./incidentStore";

/**
 * Single-table DynamoDB implementation of IncidentStore — the AWS-deployed
 * counterpart to JsonFileIncidentStore. Same interface, same callers
 * (packages/core/src/orchestrator.ts and the CDK Lambda handlers), so
 * swapping local dev for AWS is a one-line dependency-injection change.
 */
export class DynamoIncidentStore implements IncidentStore {
  private client: DynamoDBDocumentClient;

  constructor(private tableName: string, region?: string) {
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: region ?? process.env.AWS_REGION }));
  }

  async save(incident: Incident): Promise<void> {
    await this.client.send(new PutCommand({ TableName: this.tableName, Item: { pk: incident.incident_id, ...incident } }));
  }

  async get(incidentId: string): Promise<Incident | null> {
    const res = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: incidentId } }));
    if (!res.Item) return null;
    const { pk, ...incident } = res.Item as Incident & { pk: string };
    return incident as Incident;
  }

  async list(): Promise<Incident[]> {
    const res = await this.client.send(new ScanCommand({ TableName: this.tableName }));
    return (res.Items ?? []).map((item) => {
      const { pk, ...incident } = item as Incident & { pk: string };
      return incident as Incident;
    });
  }

  /** Naive tag-overlap similarity, same heuristic as JsonFileIncidentStore — a real deployment
   * would replace this with a DynamoDB GSI on service+status or a vector search (Phase 2). */
  async findSimilar(incident: Incident): Promise<SimilarIncident[]> {
    const all = await this.list();
    const symptomWords = new Set(incident.symptoms.join(" ").toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    const results: SimilarIncident[] = [];
    for (const other of all) {
      if (other.incident_id === incident.incident_id) continue;
      if (other.status !== "RESOLVED" && other.status !== "CLOSED") continue;
      if (other.service !== incident.service) continue;
      const otherWords = new Set(other.symptoms.join(" ").toLowerCase().split(/\W+/).filter((w) => w.length > 3));
      const overlap = [...symptomWords].filter((w) => otherWords.has(w)).length;
      if (overlap > 0) {
        results.push({
          incident_id: other.incident_id,
          similarity: overlap >= 3 ? "high" : overlap >= 1 ? "medium" : "low",
          service: other.service,
          resolution: other.diagnosis?.recommended_action.type ?? null,
        });
      }
    }
    return results;
  }
}
