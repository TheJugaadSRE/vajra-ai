import { DiagnosisResult, DiagnosisResultSchema, Incident } from "../schema";
import { Reasoner } from "../reasoning/types";
import { ToolContext } from "../tools/types";
import { buildToolRegistry } from "../tools/registry";

/**
 * Drives the reasoner to produce a structured DiagnosisResult and validates
 * it against the schema before it's trusted anywhere else in the pipeline —
 * a model (mock or real) never gets to hand back free-form text as "the
 * diagnosis" (section 12).
 */
export class DiagnosisAgent {
  constructor(private reasoner: Reasoner) {}

  async diagnose(incident: Incident, ctx: ToolContext, baselineMetrics: Record<string, number>): Promise<DiagnosisResult> {
    const tools = buildToolRegistry();
    const raw = await this.reasoner.diagnose(ctx, tools);
    const candidate = {
      ...raw,
      incident_id: incident.incident_id,
      reasoner: this.reasoner.name,
      generated_at: new Date().toISOString(),
      baseline_metrics: baselineMetrics,
    };
    const result = DiagnosisResultSchema.parse(candidate);
    return result;
  }
}
