import { Express } from "express";
import { SecurityProvider, VajraOrchestrator } from "@vajra/core";

/**
 * Read-only view into the (mock) Security Intelligence provider, for the
 * dashboard's live traffic/threat widgets. Blocking traffic is NOT exposed
 * here as a direct action — it only ever happens through the governed
 * incident pipeline (diagnosis -> policy -> execution), same as every other
 * remediation action.
 */
export function registerSecurityRoutes(app: Express, orchestrator: VajraOrchestrator, security: SecurityProvider): void {
  app.get("/api/security/traffic", async (req, res) => {
    const service = (req.query.service as string) ?? "checkout-service";
    const environment = (req.query.environment as string) ?? "production";

    const [traffic, suspicious_ips] = await Promise.all([
      security.getTrafficPattern(service, environment),
      security.getSuspiciousIps(service, environment),
    ]);

    const incidents = await orchestrator.listIncidents();
    const related = incidents.find(
      (i) => i.service === service && i.environment === environment && /bot|traffic|ddos|suspicious/i.test(i.title)
    );

    res.json({
      service,
      environment,
      traffic,
      suspicious_ips,
      blocked: suspicious_ips.length === 0,
      related_incident_id: related?.incident_id ?? null,
      related_incident_status: related?.status ?? null,
    });
  });
}
