import fs from "fs";
import path from "path";

export interface ServiceCatalogEntry {
  service: string;
  owner: string;
  oncall: string;
  criticality: string;
  revenue_per_minute_downtime_usd: number;
  dependencies: { service: string; type: string; criticality: string }[];
  known_failure_modes: string[];
  deployment_system: string;
  runbook: string;
}

/**
 * Local JSON/Markdown knowledge base — the RAG stand-in for Phase 1. Retrieval
 * is exact/keyword match, not embeddings; swapping in Bedrock Knowledge Bases
 * or OpenSearch later means replacing this class, not the callers (tools/).
 */
export class KnowledgeStore {
  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? process.env.VAJRA_DATA_DIR ?? path.join(__dirname, "../../../../data");
  }

  getServiceCatalogEntry(service: string): ServiceCatalogEntry | null {
    const file = path.join(this.dataDir, "knowledge", "services", `${service}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  }

  getRunbook(runbookId: string): string | null {
    const file = path.join(this.dataDir, "knowledge", "runbooks", `${runbookId}.md`);
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, "utf-8");
  }

  loadScenario(name: string): unknown {
    const file = path.join(this.dataDir, "scenarios", `${name}.json`);
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  }
}
