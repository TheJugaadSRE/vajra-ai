import { SQSHandler } from "aws-lambda";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import {
  DynamoIncidentStore,
  KnowledgeStore,
  MockDeploymentProvider,
  MockObservabilityProvider,
  DiagnosisAgent,
  MitigationAgent,
  PolicyEngine,
  IncidentManager,
  buildToolContext,
  createReasoner,
} from "@vajra/core";

const store = new DynamoIncidentStore(process.env.TABLE_NAME!);
const knowledge = new KnowledgeStore(process.env.VAJRA_DATA_DIR);
// Phase 2: swap these for DynatraceObservabilityProvider / ArgoCDDeploymentProvider etc.
const observability = new MockObservabilityProvider();
const deployment = new MockDeploymentProvider();
const incidentManager = new IncidentManager(store);
const diagnosisAgent = new DiagnosisAgent(createReasoner());
const mitigationAgent = new MitigationAgent(new PolicyEngine());
const sfn = new SFNClient({});

/**
 * SQS-triggered (fed by EventBridge). Runs Detection's downstream step —
 * Diagnosis — then hands off to Step Functions for policy/approval/execute/
 * verify, exactly mirroring services/api-local's orchestrator.ts but split
 * across AWS-native building blocks instead of one long-lived process.
 */
export const handler: SQSHandler = async (sqsEvent) => {
  for (const record of sqsEvent.Records) {
    const { incident_id } = JSON.parse(record.body);
    const incident = await store.get(incident_id);
    if (!incident) continue;

    if (observability instanceof MockObservabilityProvider) {
      observability.markDegraded(incident.service, incident.environment);
    }

    const ctx = buildToolContext(incident, observability, deployment, knowledge, store);
    const baselineMetrics = (await observability.getMetrics(incident.service, incident.environment)).reduce(
      (acc, m) => ({ ...acc, [m.metric]: m.value }),
      {} as Record<string, number>
    );
    const diagnosis = await diagnosisAgent.diagnose(incident, ctx, baselineMetrics);
    const policyDecision = mitigationAgent.evaluate(incident.environment, diagnosis);

    await incidentManager.patch(incident_id, { diagnosis, policy_decision: policyDecision });
    await incidentManager.appendTimeline(
      incident_id,
      "diagnosis",
      `Diagnosis complete: ${diagnosis.primary_hypothesis} (confidence: ${diagnosis.model_confidence})`,
      "agent"
    );

    await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: process.env.STATE_MACHINE_ARN,
        name: `${incident_id}-${Date.now()}`,
        input: JSON.stringify({
          incident_id,
          action_allowed: policyDecision.action_allowed,
          requires_approval: policyDecision.requires_approval,
        }),
      })
    );
  }
};
