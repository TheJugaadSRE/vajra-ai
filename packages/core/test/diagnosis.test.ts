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
import path from "path";

describe("DiagnosisAgent with MockReasoner", () => {
  it("identifies the recent deployment as the root cause when metrics are degraded", async () => {
    const store = new InMemoryIncidentStore();
    const manager = new IncidentManager(store);
    const observability = new MockObservabilityProvider();
    const deployment = new MockDeploymentProvider();
    const security = new MockSecurityProvider();
    const knowledge = new KnowledgeStore(path.join(__dirname, "../../../data"));

    const { incident } = await manager.ingest(
      normalizeAlert({
        eventType: "ALERT_TRIGGERED",
        service: "checkout-service",
        environment: "production",
        severity: "critical",
        alert: "HTTP 500 spike",
        source: "Dynatrace",
      })
    );
    observability.markDegraded(incident.service, incident.environment);

    const ctx = buildToolContext(incident, observability, deployment, security, knowledge, store);
    const agent = new DiagnosisAgent(new MockReasoner());
    const baselineMetrics = (await observability.getMetrics(incident.service, incident.environment)).reduce(
      (acc, m) => ({ ...acc, [m.metric]: m.value }),
      {} as Record<string, number>
    );
    const diagnosis = await agent.diagnose(incident, ctx, baselineMetrics);

    expect(diagnosis.primary_hypothesis).toMatch(/1\.4\.82/);
    expect(diagnosis.recommended_action.type).toBe("rollback_deployment");
    expect(diagnosis.risk).toBe("high");
    expect(diagnosis.human_approval_required).toBe(true);
    expect(diagnosis.contradicting_evidence.length).toBeGreaterThan(0);
    expect(diagnosis.tool_calls.length).toBeGreaterThan(0);
  });
});
