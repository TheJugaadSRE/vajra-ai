import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SFNClient, SendTaskFailureCommand, SendTaskSuccessCommand } from "@aws-sdk/client-sfn";
import { DynamoIncidentStore, IncidentManager, decideApproval } from "@vajra/core";

const store = new DynamoIncidentStore(process.env.TABLE_NAME!);
const incidentManager = new IncidentManager(store);
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});

/**
 * Invoked by API Gateway for POST /incidents/{id}/approve and .../reject.
 * Resumes the Step Functions execution that's parked in requestApproval.ts's
 * waitForTaskToken state — the human decision is what unblocks it.
 */
export const handler: APIGatewayProxyHandler = async (apiEvent) => {
  const incidentId = apiEvent.pathParameters?.id;
  const decision = apiEvent.path.endsWith("/reject") ? "REJECTED" : "APPROVED";
  if (!incidentId) return { statusCode: 400, body: JSON.stringify({ error: "Missing incident id" }) };

  const { decided_by, comment } = JSON.parse(apiEvent.body ?? "{}");
  const incident = await store.get(incidentId);
  if (!incident?.approval) {
    return { statusCode: 400, body: JSON.stringify({ error: "No pending approval on this incident" }) };
  }

  const record = await doc.send(new GetCommand({ TableName: process.env.TABLE_NAME, Key: { pk: incidentId } }));
  const taskToken = record.Item?.pending_task_token;
  if (!taskToken) {
    return { statusCode: 409, body: JSON.stringify({ error: "No in-flight approval task found for this incident" }) };
  }

  const approval = decideApproval(incident.approval, decision, decided_by ?? "unknown", comment);
  await incidentManager.patch(incidentId, { approval, status: decision === "APPROVED" ? "REMEDIATING" : "CLOSED" });
  await incidentManager.appendTimeline(
    incidentId,
    "approval",
    `${decision === "APPROVED" ? "Approved" : "Rejected"} by ${decided_by ?? "unknown"}${comment ? `: ${comment}` : ""}`,
    "human"
  );

  if (decision === "APPROVED") {
    await sfn.send(new SendTaskSuccessCommand({ taskToken, output: JSON.stringify({ approved: true }) }));
  } else {
    await sfn.send(new SendTaskFailureCommand({ taskToken, error: "ApprovalRejected", cause: comment ?? "Rejected by human reviewer" }));
  }

  await doc.send(
    new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: { pk: incidentId },
      UpdateExpression: "REMOVE pending_task_token",
    })
  );

  return { statusCode: 200, body: JSON.stringify(await store.get(incidentId)) };
};
