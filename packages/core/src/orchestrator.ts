import { Incident } from "./schema";
import { normalizeAlert } from "./ingestion/normalize";
import { IncidentManager } from "./incidents/manager";
import { IncidentStore } from "./memory/incidentStore";
import { KnowledgeStore } from "./knowledge/store";
import { ObservabilityProvider, MockObservabilityProvider } from "./providers/observability";
import { DeploymentProvider } from "./providers/deployment";
import { SecurityProvider } from "./providers/security";
import { simulateAction } from "./simulation/digitalTwin";
import { DetectionAgent } from "./agents/detectionAgent";
import { DiagnosisAgent } from "./agents/diagnosisAgent";
import { MitigationAgent } from "./agents/mitigationAgent";
import { VerificationAgent } from "./agents/verificationAgent";
import { PolicyEngine } from "./policy/engine";
import { Reasoner } from "./reasoning/types";
import { buildToolContext } from "./context/collector";
import { execute } from "./execution/executor";
import { decideApproval, requestApproval } from "./workflow/approval";

const DIAGNOSIS_DEBOUNCE_MS = 1500;

export interface OrchestratorDeps {
  store: IncidentStore;
  knowledge: KnowledgeStore;
  observability: ObservabilityProvider;
  deployment: DeploymentProvider;
  security: SecurityProvider;
  reasoner: Reasoner;
}

/**
 * Wires DETECT -> CORRELATE -> CONTEXT -> DIAGNOSE -> RECOMMEND -> POLICY ->
 * APPROVAL/AUTOMATION -> EXECUTE -> VERIFY -> MEMORY. This class is the one
 * place that knows the whole pipeline; services/api-local and the CDK Lambda
 * handlers are both thin transports around it.
 */
export class VajraOrchestrator {
  private incidentManager: IncidentManager;
  private detectionAgent: DetectionAgent;
  private diagnosisAgent: DiagnosisAgent;
  private mitigationAgent: MitigationAgent;
  private verificationAgent: VerificationAgent;
  private diagnosisTimers = new Map<string, NodeJS.Timeout>();

  constructor(private deps: OrchestratorDeps) {
    this.incidentManager = new IncidentManager(deps.store);
    this.detectionAgent = new DetectionAgent(this.incidentManager);
    this.diagnosisAgent = new DiagnosisAgent(deps.reasoner);
    this.mitigationAgent = new MitigationAgent(new PolicyEngine());
    this.verificationAgent = new VerificationAgent(deps.observability);
  }

  async ingestRawAlert(payload: unknown): Promise<Incident> {
    const event = normalizeAlert(payload);
    const { incident } = await this.detectionAgent.detect(event);

    // A reactive incident (a real alert) degrades the mock's simulated
    // metrics so the diagnosis agent has real (if synthetic) evidence to
    // find. A predictive/proactive investigation (see prediction/) is
    // different by design — nothing has actually broken yet, that's the
    // whole point of catching it early — so it must NOT flip metrics to
    // "degraded", or verification would nonsensically fail a fix that was
    // never needed to begin with.
    if (this.deps.observability instanceof MockObservabilityProvider && event.event_type !== "PREDICTED_FAILURE") {
      this.deps.observability.markDegraded(incident.service, incident.environment);
    }

    await this.incidentManager.updateStatus(incident.incident_id, "INVESTIGATING");
    this.scheduleDiagnosis(incident.incident_id);
    return (await this.deps.store.get(incident.incident_id))!;
  }

  private scheduleDiagnosis(incidentId: string): void {
    const existing = this.diagnosisTimers.get(incidentId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.diagnosisTimers.delete(incidentId);
      this.runDiagnosis(incidentId).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`Diagnosis failed for ${incidentId}:`, err);
      });
    }, DIAGNOSIS_DEBOUNCE_MS);
    this.diagnosisTimers.set(incidentId, timer);
  }

  private async runDiagnosis(incidentId: string): Promise<void> {
    const incident = await this.deps.store.get(incidentId);
    if (!incident) return;

    const ctx = buildToolContext(
      incident,
      this.deps.observability,
      this.deps.deployment,
      this.deps.security,
      this.deps.knowledge,
      this.deps.store
    );
    const baselineMetrics = (await this.deps.observability.getMetrics(incident.service, incident.environment, 5)).reduce(
      (acc, m) => ({ ...acc, [m.metric]: m.value }),
      {} as Record<string, number>
    );
    const diagnosis = await this.diagnosisAgent.diagnose(incident, ctx, baselineMetrics);
    const simulation = simulateAction(incident, diagnosis);

    const policyDecision = this.mitigationAgent.evaluate(incident.environment, diagnosis);

    let updated = await this.incidentManager.patch(incidentId, { diagnosis, simulation, policy_decision: policyDecision });
    updated = await this.incidentManager.appendTimeline(
      incidentId,
      "diagnosis",
      `Diagnosis complete: ${diagnosis.primary_hypothesis} (confidence: ${diagnosis.model_confidence}, evidence coverage: ${diagnosis.evidence_coverage})`,
      "agent",
      { diagnosis }
    );
    updated = await this.incidentManager.appendTimeline(
      incidentId,
      "simulation",
      `Digital twin simulation: ${simulation.recommended_scenario} projected to reduce error rate to ~${
        simulation.scenarios.find((s) => s.action === simulation.recommended_scenario)?.predicted_error_rate
      }%`,
      "agent",
      { simulation }
    );

    if (diagnosis.recommended_action.type === "no_action") {
      await this.incidentManager.updateStatus(incidentId, "CLOSED");
      await this.incidentManager.appendTimeline(incidentId, "closed", "No actionable remediation found; closing for manual investigation", "system");
      return;
    }

    if (policyDecision.requires_approval) {
      await this.incidentManager.patch(incidentId, { approval: requestApproval() });
      await this.incidentManager.updateStatus(incidentId, "AWAITING_APPROVAL");
      await this.incidentManager.appendTimeline(
        incidentId,
        "policy",
        `Policy requires human approval (${policyDecision.matched_rule}): ${policyDecision.reason}`,
        "system"
      );
      return;
    }

    await this.incidentManager.appendTimeline(incidentId, "policy", `Auto-approved by policy (${policyDecision.matched_rule}): ${policyDecision.reason}`, "system");
    await this.remediateAndVerify(incidentId);
  }

  async approve(incidentId: string, decidedBy: string, comment?: string): Promise<Incident> {
    const incident = await this.mustGet(incidentId);
    if (!incident.approval) throw new Error("No pending approval on this incident");
    const approval = decideApproval(incident.approval, "APPROVED", decidedBy, comment);
    await this.incidentManager.patch(incidentId, { approval, status: "REMEDIATING" });
    await this.incidentManager.appendTimeline(incidentId, "approval", `Approved by ${decidedBy}${comment ? `: ${comment}` : ""}`, "human");
    await this.remediateAndVerify(incidentId);
    return this.mustGet(incidentId);
  }

  async reject(incidentId: string, decidedBy: string, comment?: string): Promise<Incident> {
    const incident = await this.mustGet(incidentId);
    if (!incident.approval) throw new Error("No pending approval on this incident");
    const approval = decideApproval(incident.approval, "REJECTED", decidedBy, comment);
    await this.incidentManager.patch(incidentId, { approval, status: "CLOSED" });
    await this.incidentManager.appendTimeline(incidentId, "approval", `Rejected by ${decidedBy}${comment ? `: ${comment}` : ""}`, "human");
    return this.mustGet(incidentId);
  }

  private async remediateAndVerify(incidentId: string): Promise<void> {
    const incident = await this.mustGet(incidentId);
    await this.incidentManager.updateStatus(incidentId, "REMEDIATING");
    const executionRecord = await execute(incident, this.deps.deployment, this.deps.security, this.deps.observability);
    await this.incidentManager.patch(incidentId, { execution: executionRecord });
    await this.incidentManager.appendTimeline(incidentId, "execution", `${executionRecord.action}: ${executionRecord.status} — ${executionRecord.result}`, "agent");

    if (executionRecord.status !== "SUCCEEDED") {
      await this.incidentManager.updateStatus(incidentId, "ESCALATED");
      await this.incidentManager.appendTimeline(incidentId, "escalation", "Execution failed; escalating to on-call", "system");
      return;
    }

    await this.incidentManager.updateStatus(incidentId, "VERIFYING");
    const metricsBefore = incident.diagnosis?.baseline_metrics ?? {};
    const verification = await this.verificationAgent.verify(incident, metricsBefore);
    await this.incidentManager.patch(incidentId, { verification });
    await this.incidentManager.appendTimeline(
      incidentId,
      "verification",
      `Verification: ${verification.status} (before: ${JSON.stringify(verification.metrics_before)}, after: ${JSON.stringify(verification.metrics_after)})`,
      "agent"
    );

    if (verification.status === "RECOVERED") {
      await this.incidentManager.updateStatus(incidentId, "RESOLVED");
      await this.incidentManager.appendTimeline(incidentId, "memory", "Incident stored as operational memory for future similarity retrieval", "system");
    } else {
      await this.incidentManager.updateStatus(incidentId, "ESCALATED");
      await this.incidentManager.appendTimeline(incidentId, "escalation", "Remediation did not confirm recovery; escalating to on-call for next hypothesis", "system");
    }
  }

  async getIncident(incidentId: string): Promise<Incident | null> {
    return this.deps.store.get(incidentId);
  }

  async listIncidents(): Promise<Incident[]> {
    return this.deps.store.list();
  }

  async findSimilar(incidentId: string) {
    const incident = await this.mustGet(incidentId);
    return this.deps.store.findSimilar(incident);
  }

  private async mustGet(incidentId: string): Promise<Incident> {
    const incident = await this.deps.store.get(incidentId);
    if (!incident) throw new Error(`Incident not found: ${incidentId}`);
    return incident;
  }
}
