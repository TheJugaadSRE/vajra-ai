import {
  BedrockRuntimeClient,
  ContentBlock,
  ConversationRole,
  ConverseCommand,
  Message,
  Tool as BedrockTool,
  ToolResultBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { Tool, ToolContext } from "../tools/types";
import { Reasoner, RawDiagnosis } from "./types";
import { DiagnosisResultSchema } from "../schema";

const SUBMIT_DIAGNOSIS_TOOL = "submit_diagnosis";
const MAX_ITERATIONS = 6;

const SUBMIT_DIAGNOSIS_INPUT_SCHEMA = {
  json: {
    type: "object",
    properties: {
      primary_hypothesis: { type: "string" },
      model_confidence: { type: "string", enum: ["low", "medium", "high"] },
      evidence_coverage: { type: "string", enum: ["low", "medium", "high"] },
      supporting_evidence: { type: "array", items: { type: "object" } },
      contradicting_evidence: { type: "array", items: { type: "object" } },
      missing_evidence: { type: "array", items: { type: "string" } },
      alternative_hypotheses: { type: "array", items: { type: "object" } },
      recommended_action: { type: "object" },
      risk: { type: "string", enum: ["low", "medium", "high", "critical"] },
      human_approval_required: { type: "boolean" },
    },
    required: [
      "primary_hypothesis",
      "model_confidence",
      "evidence_coverage",
      "supporting_evidence",
      "contradicting_evidence",
      "missing_evidence",
      "recommended_action",
      "risk",
      "human_approval_required",
    ],
  },
};

const RawDiagnosisSchema = DiagnosisResultSchema.omit({
  incident_id: true,
  reasoner: true,
  generated_at: true,
  tool_calls: true,
  baseline_metrics: true,
});

function toBedrockTools(tools: Map<string, Tool>): BedrockTool[] {
  const toolSpecs: BedrockTool[] = Array.from(tools.values()).map((t) => ({
    toolSpec: {
      name: t.name,
      description: t.description,
      inputSchema: { json: { type: "object", properties: {} } },
    },
  }));
  toolSpecs.push({
    toolSpec: {
      name: SUBMIT_DIAGNOSIS_TOOL,
      description:
        "Submit your final structured diagnosis once you have gathered enough evidence. Only supporting_evidence/contradicting_evidence you actually observed via tool calls — never fabricate metrics or logs.",
      inputSchema: SUBMIT_DIAGNOSIS_INPUT_SCHEMA,
    },
  });
  return toolSpecs;
}

function systemPrompt(ctx: ToolContext): string {
  return [
    `You are the VAJRA AI Diagnosis Agent investigating incident ${ctx.incident.incident_id} on service "${ctx.incident.service}" (${ctx.incident.environment}).`,
    `Symptoms observed so far: ${ctx.incident.symptoms.join("; ")}.`,
    "You must gather evidence using the provided tools before forming a hypothesis — never state a root cause you have no tool-derived evidence for.",
    "Explicitly separate facts you observed from hypotheses you are inferring. Note contradicting evidence and missing evidence honestly.",
    `When you have enough evidence (or have exhausted useful tools), call ${SUBMIT_DIAGNOSIS_TOOL} with your final structured diagnosis.`,
  ].join("\n");
}

/** Real Amazon Bedrock Converse API tool-use loop. Activated via VAJRA_BEDROCK_MODE=aws. */
export class BedrockReasoner implements Reasoner {
  name = "aws-bedrock" as const;
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor(modelId?: string, region?: string) {
    this.modelId = modelId ?? process.env.VAJRA_BEDROCK_MODEL_ID ?? "anthropic.claude-3-5-sonnet-20241022-v2:0";
    this.client = new BedrockRuntimeClient({ region: region ?? process.env.AWS_REGION ?? "us-east-1" });
  }

  async diagnose(ctx: ToolContext, tools: Map<string, Tool>): Promise<RawDiagnosis> {
    const bedrockTools = toBedrockTools(tools);
    const messages: Message[] = [
      { role: ConversationRole.USER, content: [{ text: "Begin your investigation." }] },
    ];
    const toolCallLog: RawDiagnosis["tool_calls"] = [];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const response = await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: systemPrompt(ctx) }],
          messages,
          toolConfig: { tools: bedrockTools },
        })
      );

      const output = response.output?.message;
      if (!output) throw new Error("Bedrock Converse returned no output message");
      messages.push(output);

      const toolUseBlocks = (output.content ?? []).filter(
        (block: ContentBlock): block is ContentBlock.ToolUseMember => "toolUse" in block
      );

      if (toolUseBlocks.length === 0) {
        // Model stopped without submitting — treat as low-confidence, non-actionable.
        break;
      }

      const submission = toolUseBlocks.find((b) => b.toolUse.name === SUBMIT_DIAGNOSIS_TOOL);
      if (submission) {
        const parsed = RawDiagnosisSchema.safeParse(submission.toolUse.input);
        if (parsed.success) {
          return { ...parsed.data, tool_calls: toolCallLog } as RawDiagnosis;
        }
        // Invalid submission: tell the model and give it one more chance.
        messages.push({
          role: ConversationRole.USER,
          content: [
            {
              toolResult: {
                toolUseId: submission.toolUse.toolUseId,
                content: [{ text: `Invalid diagnosis format: ${parsed.error.message}. Please retry.` }],
                status: "error",
              } as ToolResultBlock,
            },
          ],
        });
        continue;
      }

      const toolResultContent: ContentBlock[] = [];
      for (const block of toolUseBlocks) {
        const tool = block.toolUse.name ? tools.get(block.toolUse.name) : undefined;
        if (!tool) {
          toolResultContent.push({
            toolResult: { toolUseId: block.toolUse.toolUseId, content: [{ text: "Unknown tool" }], status: "error" },
          } as ContentBlock);
          continue;
        }
        const result = await tool.execute((block.toolUse.input as Record<string, unknown>) ?? {}, ctx);
        toolCallLog.push({
          tool: tool.name,
          input: (block.toolUse.input as Record<string, unknown>) ?? {},
          output_summary: result.summary,
          called_at: new Date().toISOString(),
        });
        toolResultContent.push({
          toolResult: { toolUseId: block.toolUse.toolUseId, content: [{ text: result.summary }] },
        } as ContentBlock);
      }
      messages.push({ role: ConversationRole.USER, content: toolResultContent });
    }

    return {
      primary_hypothesis: "Diagnosis loop did not converge on a validated structured result",
      model_confidence: "low",
      evidence_coverage: "low",
      supporting_evidence: [],
      contradicting_evidence: [],
      missing_evidence: ["reasoner did not submit a valid diagnosis within the iteration budget"],
      alternative_hypotheses: [],
      recommended_action: {
        type: "no_action",
        target: { service: ctx.incident.service, environment: ctx.incident.environment },
        rationale: "No validated diagnosis produced",
      },
      risk: "low",
      human_approval_required: false,
      tool_calls: toolCallLog,
    };
  }
}
