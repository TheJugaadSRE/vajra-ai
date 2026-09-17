import { MockObservabilityProvider } from "../src/providers/observability";
import { PredictiveEngine } from "../src/prediction/predictiveEngine";

describe("PredictiveEngine", () => {
  it("warns about payment-service's draining connection pool but not checkout-service (stable)", async () => {
    const observability = new MockObservabilityProvider();
    const engine = new PredictiveEngine(observability);

    const predictions = await engine.scan([
      { service: "payment-service", environment: "production" },
      { service: "checkout-service", environment: "production" },
    ]);

    const paymentWarning = predictions.find((p) => p.service === "payment-service" && p.metric === "db_connection_pool_available");
    expect(paymentWarning).toBeDefined();
    expect(paymentWarning!.status).toBe("WARNING");
    expect(paymentWarning!.minutes_until_breach).not.toBeNull();
    expect(paymentWarning!.direction).toBe("decreasing");

    const checkoutPredictions = predictions.filter((p) => p.service === "checkout-service");
    expect(checkoutPredictions).toHaveLength(0);
  });

  it("keeps a prediction pinned to INVESTIGATING across rescans once linked to an incident", async () => {
    const observability = new MockObservabilityProvider();
    const engine = new PredictiveEngine(observability);
    const target = { service: "payment-service", environment: "production" };

    const [first] = await engine.scan([target]);
    const linked = engine.linkIncident(first.prediction_id, "INC-TEST123");
    expect(linked.status).toBe("INVESTIGATING");
    expect(linked.linked_incident_id).toBe("INC-TEST123");

    const rescanned = await engine.scan([target]);
    const same = rescanned.find((p) => p.prediction_id === first.prediction_id);
    expect(same!.status).toBe("INVESTIGATING");
    expect(same!.linked_incident_id).toBe("INC-TEST123");
  });

  it("allows dismissing a prediction", async () => {
    const observability = new MockObservabilityProvider();
    const engine = new PredictiveEngine(observability);
    const [first] = await engine.scan([{ service: "payment-service", environment: "production" }]);

    const dismissed = engine.dismiss(first.prediction_id);
    expect(dismissed.status).toBe("DISMISSED");
  });

  it("hydrate() seeds state so INVESTIGATING survives a fresh engine instance (e.g. a new Lambda container)", async () => {
    const observability = new MockObservabilityProvider();
    const target = { service: "payment-service", environment: "production" };

    const firstEngine = new PredictiveEngine(observability);
    const [first] = await firstEngine.scan([target]);
    const linked = firstEngine.linkIncident(first.prediction_id, "INC-TEST456");

    const freshEngine = new PredictiveEngine(observability);
    freshEngine.hydrate([linked]);
    const rescanned = await freshEngine.scan([target]);
    const same = rescanned.find((p) => p.prediction_id === first.prediction_id);
    expect(same!.status).toBe("INVESTIGATING");
    expect(same!.linked_incident_id).toBe("INC-TEST456");
  });
});
