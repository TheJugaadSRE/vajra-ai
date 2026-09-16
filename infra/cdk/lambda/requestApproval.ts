import { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { IncidentManager, DynamoIncidentStore, requestApproval } from "@vajra/core";

const store = new DynamoIncidentStore(process.env.TABLE_NAME!);
const incidentManager = new IncidentManager(store);
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface Input {
  incident_id: string;
  token: string;
}

/**
 * Step Functions Task with `waitForTaskToken`. Persists the task token
 * alongside the incident (so the API's approve/reject endpoint can resume
 * the state machine later, possibly minutes or hours from now) and returns
 * immediately — the state machine itself stays paused until
 * approvalCallback.ts calls SendTaskSuccess/SendTaskFailure.
 */
export const handler: Handler<Input, void> = async ({ incident_id, token }) => {
  await incidentManager.patch(incident_id, { approval: requestApproval(), status: "AWAITING_APPROVAL" });
  await incidentManager.appendTimeline(incident_id, "policy", "Awaiting human approval for recommended remediation", "system");

  await doc.send(
    new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: { pk: incident_id },
      UpdateExpression: "SET pending_task_token = :token",
      ExpressionAttributeValues: { ":token": token },
    })
  );
};
