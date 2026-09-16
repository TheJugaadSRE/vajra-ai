import { Express } from "express";
import { VajraOrchestrator } from "@vajra/core";

export function registerEventRoutes(app: Express, orchestrator: VajraOrchestrator): void {
  app.post("/api/events", async (req, res) => {
    try {
      const incident = await orchestrator.ingestRawAlert(req.body);
      res.status(202).json(incident);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
