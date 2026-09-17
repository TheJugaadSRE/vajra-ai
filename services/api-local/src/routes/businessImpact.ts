import { Express } from "express";
import { KnowledgeStore, VajraOrchestrator } from "@vajra/core";

const TERMINAL = new Set(["RESOLVED", "CLOSED", "ESCALATED"]);

/**
 * Aggregate business-impact estimate across all incidents, computed from the
 * static service-catalog rate (revenue_per_minute_downtime_usd) x observed
 * downtime — the same honestly-labeled illustrative calculation as the
 * per-incident figure on the Incident Detail page, just summed. This is NOT
 * a modeled financial forecast (no SLA breach modeling, no customer impact
 * modeling) — that remains a roadmap item (docs/architecture.md).
 */
export function registerBusinessImpactRoutes(app: Express, orchestrator: VajraOrchestrator, knowledge: KnowledgeStore): void {
  app.get("/api/business-impact", async (_req, res) => {
    const incidents = await orchestrator.listIncidents();
    let active_impact_usd = 0;
    let total_impact_usd = 0;
    const breakdown: { incident_id: string; service: string; status: string; estimated_usd: number }[] = [];

    for (const incident of incidents) {
      const catalog = knowledge.getServiceCatalogEntry(incident.service);
      if (!catalog) continue;
      const isTerminal = TERMINAL.has(incident.status);
      const endTime = isTerminal ? new Date(incident.updated_at) : new Date();
      const minutes = Math.max(0, (endTime.getTime() - new Date(incident.created_at).getTime()) / 60000);
      const estimated = Math.round(catalog.revenue_per_minute_downtime_usd * minutes);

      total_impact_usd += estimated;
      if (!isTerminal) active_impact_usd += estimated;
      breakdown.push({ incident_id: incident.incident_id, service: incident.service, status: incident.status, estimated_usd: estimated });
    }

    res.json({
      active_impact_usd,
      total_impact_usd,
      breakdown,
      note: "Illustrative estimate from static service-catalog rates, not a modeled financial forecast.",
    });
  });
}
