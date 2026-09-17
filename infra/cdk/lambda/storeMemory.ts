import { Handler } from "aws-lambda";
import { DynamoIncidentStore, IncidentManager } from "@vajra/core";

const store = new DynamoIncidentStore(process.env.TABLE_NAME!);
const incidentManager = new IncidentManager(store);

interface Input {
  incident_id: string;
  recovered: boolean;
}

/** Step Functions Task: final step on the happy path — mark resolved. The incident is
 * already durable in DynamoDB from every prior patch; this just records the outcome. */
export const handler: Handler<Input, void> = async ({ incident_id, recovered }) => {
  await incidentManager.updateStatus(incident_id, recovered ? "RESOLVED" : "ESCALATED");
  await incidentManager.appendTimeline(
    incident_id,
    recovered ? "memory" : "escalation",
    recovered
      ? "Incident stored as operational memory for future similarity retrieval"
      : "Remediation did not confirm recovery; escalating to on-call for next hypothesis",
    "system"
  );
};
