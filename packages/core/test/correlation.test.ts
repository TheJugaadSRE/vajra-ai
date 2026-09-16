import { IncidentManager } from "../src/incidents/manager";
import { normalizeAlert } from "../src/ingestion/normalize";
import { InMemoryIncidentStore } from "./testStore";

describe("correlation", () => {
  it("groups multiple related alerts for the same service into a single incident", async () => {
    const store = new InMemoryIncidentStore();
    const manager = new IncidentManager(store);

    const alerts = [
      { eventType: "DEPLOYMENT", service: "checkout-service", environment: "production", severity: "low", alert: "Deployment v1.4.82 completed", source: "ArgoCD" },
      { eventType: "ALERT_TRIGGERED", service: "checkout-service", environment: "production", severity: "high", alert: "Connection timeout errors increasing", source: "Dynatrace" },
      { eventType: "ALERT_TRIGGERED", service: "checkout-service", environment: "production", severity: "critical", alert: "HTTP 500 spike", source: "Dynatrace" },
      { eventType: "ALERT_TRIGGERED", service: "checkout-service", environment: "production", severity: "high", alert: "Latency increase", source: "CloudWatch" },
      { eventType: "ALERT_TRIGGERED", service: "checkout-service", environment: "production", severity: "low", alert: "CPU utilization normal", source: "CloudWatch" },
    ];

    let lastIncidentId: string | null = null;
    for (const alert of alerts) {
      const event = normalizeAlert(alert);
      const { incident } = await manager.ingest(event);
      lastIncidentId = incident.incident_id;
    }

    const allIncidents = await store.list();
    expect(allIncidents).toHaveLength(1);
    expect(allIncidents[0].incident_id).toBe(lastIncidentId);
    expect(allIncidents[0].severity).toBe("critical");
    expect(allIncidents[0].correlated_event_ids).toHaveLength(5);
    expect(allIncidents[0].symptoms).toContain("HTTP 500 spike");
  });

  it("does not correlate alerts from different services", async () => {
    const store = new InMemoryIncidentStore();
    const manager = new IncidentManager(store);

    await manager.ingest(
      normalizeAlert({ eventType: "ALERT_TRIGGERED", service: "checkout-service", environment: "production", severity: "high", alert: "HTTP 500 spike", source: "Dynatrace" })
    );
    await manager.ingest(
      normalizeAlert({ eventType: "ALERT_TRIGGERED", service: "payment-service", environment: "production", severity: "high", alert: "HTTP 500 spike", source: "Dynatrace" })
    );

    const allIncidents = await store.list();
    expect(allIncidents).toHaveLength(2);
  });
});
