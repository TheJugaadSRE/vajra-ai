import { ExecutionRecord, Incident } from "../schema";
import { DeploymentProvider } from "../providers/deployment";
import { SecurityProvider } from "../providers/security";
import { ObservabilityProvider } from "../providers/observability";
import { validateAndDispatch } from "./toolGateway";

export async function execute(
  incident: Incident,
  deployment: DeploymentProvider,
  security: SecurityProvider,
  observability: ObservabilityProvider
): Promise<ExecutionRecord> {
  if (!incident.diagnosis || !incident.policy_decision) {
    throw new Error("Cannot execute without a diagnosis and policy decision");
  }
  const action = incident.diagnosis.recommended_action;
  const started_at = new Date().toISOString();
  try {
    const result = await validateAndDispatch(
      incident,
      action,
      incident.policy_decision,
      incident.approval,
      deployment,
      security,
      observability
    );
    return {
      action: `${action.type} on ${action.target.service}/${action.target.environment}`,
      status: result.success ? "SUCCEEDED" : "FAILED",
      started_at,
      finished_at: new Date().toISOString(),
      result: result.message,
    };
  } catch (err) {
    return {
      action: `${action.type} on ${action.target.service}/${action.target.environment}`,
      status: "FAILED",
      started_at,
      finished_at: new Date().toISOString(),
      result: err instanceof Error ? err.message : String(err),
    };
  }
}
