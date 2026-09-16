import { ApprovalRecord, Incident, PolicyDecision, RecommendedAction } from "../schema";
import { DeploymentProvider } from "../providers/deployment";
import { MockObservabilityProvider } from "../providers/observability";

export class ExecutionNotPermittedError extends Error {}

/**
 * The execution layer never trusts the model-generated action blindly
 * (section 17). Before dispatching to real infrastructure, it independently
 * re-checks: target matches the incident, policy allows it, and — if
 * approval was required — that approval was actually granted.
 */
export async function validateAndDispatch(
  incident: Incident,
  action: RecommendedAction,
  policyDecision: PolicyDecision,
  approval: ApprovalRecord | null,
  deployment: DeploymentProvider,
  observability: unknown
): Promise<{ success: boolean; message: string }> {
  if (action.target.service !== incident.service || action.target.environment !== incident.environment) {
    throw new ExecutionNotPermittedError(
      `Action target (${action.target.service}/${action.target.environment}) does not match incident (${incident.service}/${incident.environment})`
    );
  }
  if (!policyDecision.action_allowed) {
    throw new ExecutionNotPermittedError(`Policy engine blocked this action: ${policyDecision.reason}`);
  }
  if (policyDecision.requires_approval && approval?.status !== "APPROVED") {
    throw new ExecutionNotPermittedError("Action requires approval but no approval was granted");
  }

  let result: { success: boolean; message: string };
  switch (action.type) {
    case "rollback_deployment":
      result = await deployment.rollback(action.target.service, action.target.environment, action.target.version ?? "previous-stable");
      break;
    case "restart_service":
      result = await deployment.restartService(action.target.service, action.target.environment);
      break;
    case "scale_service":
      result = await deployment.scaleService(action.target.service, action.target.environment, (action.params?.replicas as number) ?? 4);
      break;
    case "no_action":
      result = { success: true, message: "No remediation action was recommended" };
      break;
    default:
      throw new ExecutionNotPermittedError(`Unknown action type: ${action.type}`);
  }

  // Demo-mode narrative: a rollback of the regressing deployment actually
  // fixes the mock's simulated metrics; a restart alone does not (the bad
  // config is still deployed) — this is what makes the verification step
  // meaningful rather than a rubber stamp.
  if (observability instanceof MockObservabilityProvider && action.type === "rollback_deployment" && result.success) {
    observability.markRecovered(action.target.service, action.target.environment);
  }

  return result;
}
