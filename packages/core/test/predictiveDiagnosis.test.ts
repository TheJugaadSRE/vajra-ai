import { IncidentManager } from "../src/incidents/manager";
import { normalizeAlert } from "../src/ingestion/normalize";
import { InMemoryIncidentStore } from "./testStore";
import { MockObservabilityProvider } from "../src/providers/observability";
import { MockDeploymentProvider } from "../src/providers/deployment";
import { MockSecurityProvider } from "../src/providers/security";
import { KnowledgeStore } from "../src/knowledge/store";
import { MockReasoner } from "../src/reasoning/mock";
import { DiagnosisAgent } from "../src/agents/diagnosisAgent";
import { buildToolContext } from "../src/context/collector";
import { PolicyEngine } from "../src/policy/engine";
import path from "path";

describe("DiagnosisAgent with MockReasoner — predictive/proactive warning", () => {
  it("recommends a proactive restart and requires approval in production, citing the forecast as evidence", async () => {
    const store = new InMemoryIncidentStore();
    const manager = new IncidentManager(store);
    const observability = new MockObservabilityProvider();
    const deployment = new MockDeploymentProvider();
    const security = new MockSecurityProvider();
    const knowledge = new KnowledgeStore(path.join(__dirname, "../../../data"));

    const { incident } = await manager.ingest(
      normalizeAlert({
        eventType: "PREDICTED_FAILURE",
        service: "payment-service",
        environment: "production",
        severity: "high",
        alert: "Predictive Engine: payment-service db_connection_pool_available trending toward connection pool exhaustion in ~24 min",
        source: "VAJRA Predictive Engine",
      })
    );
    // Note: metrics are NOT marked degraded — this is a proactive investigation, not a live incident.

    const ctx = buildToolContext(incident, observability, deployment, security, knowledge, store);
    const agent = new DiagnosisAgent(new MockReasoner());
    const baselineMetrics = (await observability.getMetrics(incident.service, incident.environment)).reduce(
      (acc, m) => ({ ...acc, [m.metric]: m.value }),
      {} as Record<string, number>
    );
    const diagnosis = await agent.diagnose(incident, ctx, baselineMetrics);

    expect(diagnosis.recommended_action.type).toBe("restart_service");
    expect(diagnosis.contradicting_evidence.length).toBeGreaterThan(0); // metrics are still healthy right now
    expect(diagnosis.supporting_evidence.some((e) => e.source_tool === "predictive_engine")).toBe(true);

    const policy = new PolicyEngine().evaluate("production", diagnosis.recommended_action);
    expect(policy.requires_approval).toBe(true);
    expect(policy.matched_rule).toBe("prod-restart-tier1-requires-approval");
  });
});
