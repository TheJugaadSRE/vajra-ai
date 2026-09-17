import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoIncidentStore } from "@vajra/core";

const store = new DynamoIncidentStore(process.env.TABLE_NAME!);

export const handler: APIGatewayProxyHandler = async () => {
  const incidents = await store.list();
  const summaries = incidents.map((i) => ({
    incident_id: i.incident_id,
    title: i.title,
    service: i.service,
    environment: i.environment,
    severity: i.severity,
    status: i.status,
    updated_at: i.updated_at,
  }));
  return { statusCode: 200, body: JSON.stringify(summaries) };
};
