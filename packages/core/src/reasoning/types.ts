import { DiagnosisResult } from "../schema";
import { Tool, ToolContext } from "../tools/types";

/** What a Reasoner produces before the agent stamps incident_id/reasoner/generated_at onto it. */
export type RawDiagnosis = Omit<DiagnosisResult, "incident_id" | "reasoner" | "generated_at" | "baseline_metrics">;

/**
 * The reasoning layer is swappable: MockReasoner runs a real (but scripted)
 * tool-use loop offline; BedrockReasoner drives the same tools through
 * Amazon Bedrock's Converse API tool-use loop. diagnosisAgent.ts doesn't
 * know or care which one it's talking to.
 */
export interface Reasoner {
  name: "mock" | "aws-bedrock";
  diagnose(ctx: ToolContext, tools: Map<string, Tool>): Promise<RawDiagnosis>;
}
