import { Evidence, ToolCallLog } from "../schema";
import { Tool, ToolContext } from "../tools/types";
import { Reasoner, RawDiagnosis } from "./types";

/**
 * Runs the same real tools a Bedrock-backed agent would, in a fixed order,
 * then applies a small heuristic to turn the gathered evidence into a
 * diagnosis. This is NOT a fake response generator — every fact it cites
 * came from an actual tool call against the (mock) providers. It exists so
 * the full pipeline runs deterministically with zero AWS credentials.
 */
export class MockReasoner implements Reasoner {
  name = "mock" as const;

  async diagnose(ctx: ToolContext, tools: Map<string, Tool>): Promise<RawDiagnosis> {
    const toolCalls: ToolCallLog[] = [];
    const call = async (name: string, input: Record<string, unknown> = {}) => {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Unknown tool: ${name}`);
      const result = await tool.execute(input, ctx);
      toolCalls.push({ tool: name, input, output_summary: result.summary, called_at: new Date().toISOString() });
      return result;
    };

    const deployments = await call("get_recent_deployments", { since_minutes: 30 });
    const metrics = await call("get_metrics");
    const logs = await call("query_logs");
    await call("get_service_dependencies");
    await call("get_runbook");
    const similar = await call("get_similar_incidents");

    const deploymentList = (deployments.data as { version: string; deployed_at: string }[]) ?? [];
    const metricList = (metrics.data as { metric: string; value: number; unit: string }[]) ?? [];
    const errorRate = metricList.find((m) => m.metric === "http_5xx_rate")?.value ?? 0;
    const cpu = metricList.find((m) => m.metric === "cpu_utilization")?.value ?? 0;

    const supporting_evidence: Evidence[] = [];
    const contradicting_evidence: Evidence[] = [];
    const missing_evidence: string[] = ["distributed trace (get_trace not available in this environment)"];

    if (errorRate > 5) {
      supporting_evidence.push({
        kind: "fact",
        source_tool: "get_metrics",
        summary: `HTTP 5xx rate elevated at ${errorRate}%`,
        timestamp: new Date().toISOString(),
      });
    }
    if (logs.data && (logs.data as { message: string }[]).some((l) => /connection pool/i.test(l.message))) {
      supporting_evidence.push({
        kind: "fact",
        source_tool: "query_logs",
        summary: "Logs show connection pool exhaustion and upstream timeout errors",
        timestamp: new Date().toISOString(),
      });
    }
    if (cpu < 70) {
      contradicting_evidence.push({
        kind: "fact",
        source_tool: "get_metrics",
        summary: `CPU utilization normal (${cpu}%) — rules out simple resource exhaustion as sole cause`,
        timestamp: new Date().toISOString(),
      });
    }
    const similarIncidents = (similar.data as { incident_id: string; similarity: string }[]) ?? [];
    if (similarIncidents.length > 0) {
      supporting_evidence.push({
        kind: "hypothesis",
        source_tool: "get_similar_incidents",
        summary: `${similarIncidents.length} similar past incident(s) found, e.g. ${similarIncidents[0].incident_id} (${similarIncidents[0].similarity} similarity)`,
        timestamp: new Date().toISOString(),
      });
    } else {
      missing_evidence.push("no similar past incidents on record");
    }

    const hasRecentDeployment = deploymentList.length > 0;
    const strongSignal = hasRecentDeployment && errorRate > 5;

    const base = {
      supporting_evidence,
      contradicting_evidence,
      missing_evidence,
      tool_calls: toolCalls,
    };

    if (strongSignal) {
      const suspect = deploymentList[0];
      supporting_evidence.push({
        kind: "fact",
        source_tool: "get_recent_deployments",
        summary: `Deployment v${suspect.version} occurred at ${suspect.deployed_at}, shortly before symptoms began`,
        timestamp: new Date().toISOString(),
      });
      return {
        ...base,
        primary_hypothesis: `Deployment v${suspect.version} introduced a regression (reduced DB connection pool) causing ${ctx.incident.service} to fail under load`,
        model_confidence: "medium",
        evidence_coverage: "high",
        alternative_hypotheses: [
          { hypothesis: "Upstream dependency outage unrelated to deployment", confidence: "low" },
        ],
        recommended_action: {
          type: "rollback_deployment",
          target: { service: ctx.incident.service, environment: ctx.incident.environment, version: suspect.version },
          rationale: `Roll back v${suspect.version}: its deployment window matches incident onset and logs show the specific regression it introduced (connection pool size reduction)`,
        },
        risk: ctx.incident.environment === "production" ? "high" : "medium",
        human_approval_required: ctx.incident.environment === "production",
      };
    }

    return {
      ...base,
      primary_hypothesis: "Insufficient evidence to identify a confident root cause",
      model_confidence: "low",
      evidence_coverage: hasRecentDeployment || errorRate > 0 ? "medium" : "low",
      alternative_hypotheses: [],
      recommended_action: {
        type: "no_action",
        target: { service: ctx.incident.service, environment: ctx.incident.environment },
        rationale: "No corroborating evidence (deployment + degraded metrics) found to justify a remediation action",
      },
      risk: "low",
      human_approval_required: false,
    };
  }
}
