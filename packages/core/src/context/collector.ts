import { Incident } from "../schema";
import { ObservabilityProvider } from "../providers/observability";
import { DeploymentProvider } from "../providers/deployment";
import { SecurityProvider } from "../providers/security";
import { KnowledgeStore } from "../knowledge/store";
import { IncidentStore } from "../memory/incidentStore";
import { ToolContext } from "../tools/types";
import { buildToolRegistry } from "../tools/registry";

/**
 * Assembles the evidence-gathering context (tool registry + provider/knowledge/
 * memory handles) that the Diagnosis Agent's reasoner is handed. Deciding
 * *which* tool to call and *when* is the reasoner's job (see reasoning/); this
 * module only makes the tools available.
 */
export function buildToolContext(
  incident: Incident,
  observability: ObservabilityProvider,
  deployment: DeploymentProvider,
  security: SecurityProvider,
  knowledge: KnowledgeStore,
  memory: IncidentStore
): ToolContext {
  return { incident, observability, deployment, security, knowledge, memory };
}

export { buildToolRegistry };
