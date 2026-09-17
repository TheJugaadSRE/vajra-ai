import { APIGatewayProxyHandler } from "aws-lambda";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { DynamoIncidentStore, IncidentManager, normalizeAlert } from "@vajra/core";

const eventBridge = new EventBridgeClient({});
const store = new DynamoIncidentStore(process.env.TABLE_NAME!);
const incidentManager = new IncidentManager(store);

/**
 * API Gateway entry point. Normalizes + correlates synchronously (cheap,
 * deterministic — section 7), then hands off to EventBridge so diagnosis
 * (the expensive, AI-driven step) happens asynchronously.
 */
export const handler: APIGatewayProxyHandler = async (apiEvent) => {
  try {
    const payload = JSON.parse(apiEvent.body ?? "{}");
    const event = normalizeAlert(payload);
    const { incident } = await incidentManager.ingest(event);
    await incidentManager.updateStatus(incident.incident_id, "INVESTIGATING");

    await eventBridge.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: process.env.EVENT_BUS_NAME,
            Source: "vajra.ingestion",
            DetailType: "IncidentCorrelated",
            Detail: JSON.stringify({ incident_id: incident.incident_id }),
          },
        ],
      })
    );

    return { statusCode: 202, body: JSON.stringify(incident) };
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) };
  }
};
