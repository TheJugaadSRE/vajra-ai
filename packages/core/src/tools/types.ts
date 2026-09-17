import { z } from "zod";
import { ObservabilityProvider } from "../providers/observability";
import { DeploymentProvider } from "../providers/deployment";
import { SecurityProvider } from "../providers/security";
import { KnowledgeStore } from "../knowledge/store";
import { IncidentStore } from "../memory/incidentStore";
import { Incident } from "../schema";

export interface ToolContext {
  incident: Incident;
  observability: ObservabilityProvider;
  deployment: DeploymentProvider;
  security: SecurityProvider;
  knowledge: KnowledgeStore;
  memory: IncidentStore;
}

export interface ToolResult {
  summary: string;
  data: unknown;
}

export interface Tool<TInput = any> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute(input: TInput, ctx: ToolContext): Promise<ToolResult>;
}
