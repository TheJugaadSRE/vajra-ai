import { Event, Incident } from "../schema";
import { IncidentManager } from "../incidents/manager";

/**
 * Detection is deliberately deterministic (section 8): classify severity and
 * correlate into an incident. AI-assisted semantic correlation is a Phase 2
 * hook (e.g. when service/environment keys don't match but symptoms clearly
 * describe the same failure) — not needed for the MVP's demo scenario.
 */
export class DetectionAgent {
  constructor(private incidentManager: IncidentManager) {}

  async detect(event: Event): Promise<{ incident: Incident; isNew: boolean }> {
    return this.incidentManager.ingest(event);
  }
}
