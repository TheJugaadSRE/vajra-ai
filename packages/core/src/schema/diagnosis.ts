import { z } from "zod";

export const EvidenceSchema = z.object({
  kind: z.enum(["fact", "hypothesis"]),
  source_tool: z.string(),
  summary: z.string(),
  timestamp: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ToolCallLogSchema = z.object({
  tool: z.string(),
  input: z.record(z.unknown()),
  output_summary: z.string(),
  called_at: z.string(),
});
export type ToolCallLog = z.infer<typeof ToolCallLogSchema>;

export const RiskSchema = z.enum(["low", "medium", "high", "critical"]);
export type Risk = z.infer<typeof RiskSchema>;

export const RecommendedActionSchema = z.object({
  type: z.enum(["rollback_deployment", "restart_service", "scale_service", "block_traffic", "no_action"]),
  target: z.object({
    service: z.string(),
    environment: z.string(),
    version: z.string().optional(),
  }),
  params: z.record(z.unknown()).optional(),
  rationale: z.string(),
});
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;

/**
 * Structured diagnosis output. Deliberately separates the LLM's self-reported
 * confidence from evidence coverage — an "91% confidence" from a model is not
 * a calibrated probability, so the UI must never conflate the two.
 */
export const DiagnosisResultSchema = z.object({
  incident_id: z.string(),
  primary_hypothesis: z.string(),
  model_confidence: z.enum(["low", "medium", "high"]),
  evidence_coverage: z.enum(["low", "medium", "high"]),
  supporting_evidence: z.array(EvidenceSchema),
  contradicting_evidence: z.array(EvidenceSchema),
  missing_evidence: z.array(z.string()),
  alternative_hypotheses: z.array(
    z.object({ hypothesis: z.string(), confidence: z.enum(["low", "medium", "high"]) })
  ),
  recommended_action: RecommendedActionSchema,
  risk: RiskSchema,
  human_approval_required: z.boolean(),
  tool_calls: z.array(ToolCallLogSchema),
  /** Metrics captured at diagnosis time, persisted so verification (which may run in a
   * different process/Lambda invocation entirely) can compare before/after reliably. */
  baseline_metrics: z.record(z.number()),
  reasoner: z.enum(["mock", "aws-bedrock"]),
  generated_at: z.string(),
});
export type DiagnosisResult = z.infer<typeof DiagnosisResultSchema>;
