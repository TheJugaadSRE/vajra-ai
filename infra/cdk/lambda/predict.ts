import { ScheduledHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { MockObservabilityProvider, Prediction, PredictiveEngine } from "@vajra/core";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.PREDICTIONS_TABLE_NAME!;

// Phase 2: swap for a real ObservabilityProvider. The watch list is an env
// var rather than KnowledgeStore's service catalog because the local
// data/knowledge JSON files aren't bundled into this Lambda's deployment
// package yet (see docs/architecture.md's data-bundling gap) — this keeps
// the scheduled forecast actually functional in the meantime.
const observability = new MockObservabilityProvider();
const engine = new PredictiveEngine(observability);
const WATCHED_SERVICES = (process.env.WATCHED_SERVICES ?? "checkout-service,payment-service")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * EventBridge Schedule target, run every few minutes. Each invocation is a
 * fresh container with no memory of the last run, so it hydrates the engine
 * from DynamoDB first (preserving any INVESTIGATING/DISMISSED state a human
 * has already set via the API) before re-scanning and writing the refreshed
 * predictions back.
 */
export const handler: ScheduledHandler = async () => {
  const existing = await doc.send(new ScanCommand({ TableName: TABLE_NAME }));
  engine.hydrate((existing.Items ?? []) as Prediction[]);

  const predictions = await engine.scan(WATCHED_SERVICES.map((service) => ({ service, environment: "production" })));

  await Promise.all(predictions.map((prediction) => doc.send(new PutCommand({ TableName: TABLE_NAME, Item: prediction }))));
};
