import express, { Express } from "express";
import cors from "cors";
import path from "path";
import {
  VajraOrchestrator,
  JsonFileIncidentStore,
  KnowledgeStore,
  MockObservabilityProvider,
  MockDeploymentProvider,
  createReasoner,
} from "@vajra/core";
import { registerEventRoutes } from "./routes/events";
import { registerIncidentRoutes } from "./routes/incidents";
import { registerDemoRoutes } from "./routes/demo";

export interface AppHandle {
  app: Express;
  orchestrator: VajraOrchestrator;
  startedAt: string;
}

/** Builds a fresh app + orchestrator + in-memory-backed store. Used by both server.ts and tests. */
export function createApp(storeFilePath?: string): AppHandle {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const dataDir = path.join(__dirname, "..", "..", "..", "data");
  const store = new JsonFileIncidentStore(storeFilePath);
  const knowledge = new KnowledgeStore(dataDir);
  const observability = new MockObservabilityProvider();
  const deployment = new MockDeploymentProvider();
  const reasoner = createReasoner();

  const orchestrator = new VajraOrchestrator({ store, knowledge, observability, deployment, reasoner });
  const startedAt = new Date().toISOString();

  registerEventRoutes(app, orchestrator);
  registerIncidentRoutes(app, orchestrator, knowledge);
  registerDemoRoutes(app, orchestrator, knowledge);

  app.get("/api/health", async (_req, res) => {
    const incidents = await orchestrator.listIncidents();
    res.json({
      status: "ok",
      started_at: startedAt,
      incident_count: incidents.length,
      open_incidents: incidents.filter((i) => !["RESOLVED", "CLOSED"].includes(i.status)).length,
      reasoner: reasoner.name,
    });
  });

  return { app, orchestrator, startedAt };
}
