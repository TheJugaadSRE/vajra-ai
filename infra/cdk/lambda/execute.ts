import { Handler } from "aws-lambda";
import { DynamoIncidentStore, IncidentManager, MockDeploymentProvider, MockObservabilityProvider, execute } from "@vajra/core";

const store = new DynamoIncidentStore(process.env.TABLE_NAME!);
const incidentManager = new IncidentManager(store);
const deployment = new MockDeploymentProvider();
// NOTE: MockObservabilityProvider's health state is in-memory per Lambda
// container, so it will NOT reflect the markDegraded() call made by
// orchestrate.ts's separate container in this distributed deployment — a
// real deployment replaces this with a real ObservabilityProvider (Phase 2),
// which doesn't have this limitation. This is a known, called-out gap of
// running the "mock demo narrative" across AWS Lambda rather than one process.
const observability = new MockObservabilityProvider();

interface Input {
  incident_id: string;
}

/** Step Functions Task: dispatches the approved (or auto-allowed) remediation action. */
export const handler: Handler<Input, Input> = async ({ incident_id }) => {
  const incident = await store.get(incident_id);
  if (!incident) throw new Error(`Incident not found: ${incident_id}`);

  await incidentManager.updateStatus(incident_id, "REMEDIATING");
  const record = await execute(incident, deployment, observability);
  await incidentManager.patch(incident_id, { execution: record });
  await incidentManager.appendTimeline(incident_id, "execution", `${record.action}: ${record.status} — ${record.result}`, "agent");

  if (record.status !== "SUCCEEDED") {
    // Caught by the state machine's Catch block, routed to the escalate state.
    throw new Error(`Execution failed: ${record.result}`);
  }
  return { incident_id };
};
