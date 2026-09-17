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

describe("DiagnosisAgent with MockReasoner — security/bot-attack incident", () => {
  it("identifies flagged IPs as the cause of a traffic spike and recommends blocking them, auto-allowed by policy", async () => {
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
        severity: "high",
        alert: "Suspicious traffic spike detected",
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

    expect(diagnosis.recommended_action.type).toBe("block_traffic");
    expect(diagnosis.recommended_action.params?.ips).toBeDefined();
    expect(diagnosis.supporting_evidence.length).toBeGreaterThan(0);

    const policy = new PolicyEngine().evaluate("production", diagnosis.recommended_action);
    expect(policy.action_allowed).toBe(true);
    expect(policy.requires_approval).toBe(false);
    expect(policy.matched_rule).toBe("block-traffic-auto-allowed");
  });
});
