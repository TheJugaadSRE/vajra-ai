import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoIncidentStore } from "@vajra/core";

const store = new DynamoIncidentStore(process.env.TABLE_NAME!);

export const handler: APIGatewayProxyHandler = async (event) => {
  const id = event.pathParameters?.id;
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: "Missing incident id" }) };
  const incident = await store.get(id);
  if (!incident) return { statusCode: 404, body: JSON.stringify({ error: "Incident not found" }) };
  const similar = await store.findSimilar(incident);
  return { statusCode: 200, body: JSON.stringify(similar) };
};
