import { Handler } from "aws-lambda";
import { DynamoIncidentStore, IncidentManager, MockObservabilityProvider, VerificationAgent } from "@vajra/core";

const store = new DynamoIncidentStore(process.env.TABLE_NAME!);
const incidentManager = new IncidentManager(store);
const observability = new MockObservabilityProvider();
const verificationAgent = new VerificationAgent(observability);

interface Input {
  incident_id: string;
}

/** Step Functions Task: never assume the remediation worked just because it ran (section 18). */
export const handler: Handler<Input, Input & { recovered: boolean }> = async ({ incident_id }) => {
  const incident = await store.get(incident_id);
  if (!incident?.diagnosis) throw new Error(`Incident or diagnosis not found: ${incident_id}`);

  await incidentManager.updateStatus(incident_id, "VERIFYING");
  const verification = await verificationAgent.verify(incident, incident.diagnosis.baseline_metrics);
  await incidentManager.patch(incident_id, { verification });
  await incidentManager.appendTimeline(incident_id, "verification", `Verification: ${verification.status}`, "agent");

  return { incident_id, recovered: verification.status === "RECOVERED" };
};
