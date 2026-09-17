import { Handler } from "aws-lambda";
import { DynamoIncidentStore, IncidentManager } from "@vajra/core";

const store = new DynamoIncidentStore(process.env.TABLE_NAME!);
const incidentManager = new IncidentManager(store);

interface Input {
  incident_id: string;
  reason?: string;
}

/** Step Functions Task: reached when policy blocks the action, or the Catch block fires. */
export const handler: Handler<Input, void> = async ({ incident_id, reason }) => {
  await incidentManager.updateStatus(incident_id, "ESCALATED");
  await incidentManager.appendTimeline(incident_id, "escalation", reason ?? "Escalated to on-call", "system");
};
