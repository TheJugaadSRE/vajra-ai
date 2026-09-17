import { Express } from "express";
import { KnowledgeStore, PredictiveEngine, VajraOrchestrator } from "@vajra/core";

/**
 * Predictive Failure Engine endpoints. GET recomputes forecasts on demand
 * against the current (mock) metric history — there's no background
 * scheduler in local dev (the AWS design adds one via EventBridge Schedule,
 * see infra/cdk). Investigating a prediction reuses the exact same
 * DETECT->VERIFY pipeline as a real alert — it just synthesizes the alert
 * from the forecast instead of waiting for a real one to fire.
 */
export function registerPredictionRoutes(app: Express, engine: PredictiveEngine, knowledge: KnowledgeStore, orchestrator: VajraOrchestrator): void {
  app.get("/api/predictions", async (_req, res) => {
    const targets = knowledge.listServiceNames().map((service) => ({ service, environment: "production" }));
    const predictions = await engine.scan(targets);
    res.json(predictions);
  });

  app.post("/api/predictions/:id/investigate", async (req, res) => {
    const prediction = engine.get(req.params.id);
    if (!prediction) return res.status(404).json({ error: "Prediction not found" });
    if (prediction.linked_incident_id) {
      return res.status(409).json({ error: `Already linked to incident ${prediction.linked_incident_id}` });
    }

    const incident = await orchestrator.ingestRawAlert({
      eventType: "PREDICTED_FAILURE",
      service: prediction.service,
      environment: prediction.environment,
      severity: "high",
      alert: `Predictive Engine: ${prediction.description}`,
      source: "VAJRA Predictive Engine",
    });

    const updated = engine.linkIncident(prediction.prediction_id, incident.incident_id);
    res.json({ prediction: updated, incident });
  });

  app.post("/api/predictions/:id/dismiss", async (req, res) => {
    try {
      const updated = engine.dismiss(req.params.id);
      res.json(updated);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
