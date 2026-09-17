import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.PREDICTIONS_TABLE_NAME!;

/**
 * Read-only. Promoting a prediction into an incident (investigate/dismiss)
 * is not yet wired up for the AWS deployment — only for local dev
 * (services/api-local/src/routes/predictions.ts) — because that needs the
 * same DynamoDB-backed hydrate/persist plumbing predict.ts uses, applied to
 * a request-driven Lambda instead of a scheduled one. Documented as a gap,
 * not silently missing.
 */
export const handler: APIGatewayProxyHandler = async () => {
  const res = await doc.send(new ScanCommand({ TableName: TABLE_NAME }));
  return { statusCode: 200, body: JSON.stringify(res.Items ?? []) };
};
