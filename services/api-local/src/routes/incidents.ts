import { Express } from "express";
import { KnowledgeStore, VajraOrchestrator } from "@vajra/core";

export function registerIncidentRoutes(app: Express, orchestrator: VajraOrchestrator, knowledge: KnowledgeStore): void {
  app.get("/api/incidents", async (_req, res) => {
    const incidents = await orchestrator.listIncidents();
    res.json(
      incidents.map((i) => ({
        incident_id: i.incident_id,
        title: i.title,
        service: i.service,
        environment: i.environment,
        severity: i.severity,
        status: i.status,
        updated_at: i.updated_at,
      }))
    );
  });

  app.get("/api/incidents/:id", async (req, res) => {
    const incident = await orchestrator.getIncident(req.params.id);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    const service_catalog = knowledge.getServiceCatalogEntry(incident.service);
    res.json({ ...incident, service_catalog });
  });

  app.get("/api/incidents/:id/similar", async (req, res) => {
    try {
      const similar = await orchestrator.findSimilar(req.params.id);
      res.json(similar);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/incidents/:id/approve", async (req, res) => {
    try {
      const { decided_by, comment } = req.body ?? {};
      const incident = await orchestrator.approve(req.params.id, decided_by ?? "unknown", comment);
      res.json(incident);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/incidents/:id/reject", async (req, res) => {
    try {
      const { decided_by, comment } = req.body ?? {};
      const incident = await orchestrator.reject(req.params.id, decided_by ?? "unknown", comment);
      res.json(incident);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
