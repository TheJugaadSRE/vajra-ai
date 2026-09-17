import { Express } from "express";
import { KnowledgeStore, VajraOrchestrator } from "@vajra/core";

interface ScenarioEvent {
  delay_ms: number;
  eventType: string;
  service: string;
  environment: string;
  severity: string;
  alert: string;
  source: string;
}

interface Scenario {
  name: string;
  description: string;
  events: ScenarioEvent[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function registerDemoRoutes(app: Express, orchestrator: VajraOrchestrator, knowledge: KnowledgeStore): void {
  app.post("/api/demo/run-scenario", async (req, res) => {
    const name = (req.body?.scenario as string) ?? "checkout-incident";
    let scenario: Scenario;
    try {
      scenario = knowledge.loadScenario(name) as Scenario;
    } catch {
      return res.status(404).json({ error: `Scenario not found: ${name}` });
    }

    res.status(202).json({ started: true, scenario: scenario.name, event_count: scenario.events.length });

    // Fire-and-forget: replay events with their relative delays so the UI can
    // watch correlation happen in near-real-time via polling.
    (async () => {
      for (const event of scenario.events) {
        await sleep(event.delay_ms);
        try {
          await orchestrator.ingestRawAlert({ ...event, timestamp: new Date().toISOString() });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("Demo scenario event failed:", err);
        }
      }
    })();
  });
}
