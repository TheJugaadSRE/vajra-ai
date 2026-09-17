import { Evidence, ToolCallLog } from "../schema";
import { Tool, ToolContext } from "../tools/types";
import { Reasoner, RawDiagnosis } from "./types";

const SECURITY_SYMPTOM_PATTERN = /bot|ddos|scraping|suspicious traffic|traffic spike/i;
const PREDICTIVE_SYMPTOM_PATTERN = /predictive engine|trending toward/i;

type ToolCaller = (name: string, input?: Record<string, unknown>) => Promise<{ summary: string; data: unknown }>;

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
    const call: ToolCaller = async (name, input = {}) => {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Unknown tool: ${name}`);
      const result = await tool.execute(input, ctx);
      toolCalls.push({ tool: name, input, output_summary: result.summary, called_at: new Date().toISOString() });
      return result;
    };

    const symptomText = ctx.incident.symptoms.join(" ");
    if (PREDICTIVE_SYMPTOM_PATTERN.test(symptomText)) return this.diagnosePredictiveWarning(ctx, call, toolCalls);
    if (SECURITY_SYMPTOM_PATTERN.test(symptomText)) return this.diagnoseSecurityIncident(ctx, call, toolCalls);
    return this.diagnoseDeploymentRegression(ctx, call, toolCalls);
  }

  /**
   * Triggered when an engineer promotes a Predictive Failure Engine warning
   * into a real investigation (see prediction/predictiveEngine.ts) — there is
   * no customer-facing symptom yet, only a forecast, so the evidence here
   * looks different: the "supporting evidence" is the trend itself, and
   * healthy current metrics are honestly logged as contradicting evidence.
   */
  private async diagnosePredictiveWarning(ctx: ToolContext, call: ToolCaller, toolCalls: ToolCallLog[]): Promise<RawDiagnosis> {
    const metrics = await call("get_metrics");
    await call("get_recent_deployments", { since_minutes: 60 });
    await call("get_service_owner");

    const metricList = (metrics.data as { metric: string; value: number }[]) ?? [];
    const errorRate = metricList.find((m) => m.metric === "http_5xx_rate")?.value ?? 0;

    const supporting_evidence: Evidence[] = [
      {
        kind: "hypothesis",
        source_tool: "predictive_engine",
        summary: ctx.incident.symptoms[ctx.incident.symptoms.length - 1],
        timestamp: new Date().toISOString(),
      },
    ];
    const contradicting_evidence: Evidence[] = [];
    if (errorRate < 5) {
      contradicting_evidence.push({
        kind: "fact",
        source_tool: "get_metrics",
        summary: `Current HTTP 5xx rate is still normal (${errorRate}%) — no customer-facing impact yet`,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      supporting_evidence,
      contradicting_evidence,
      missing_evidence: [
        "no live customer-facing symptoms yet — this is a proactive investigation triggered by a forecast, not an active incident",
      ],
      tool_calls: toolCalls,
      primary_hypothesis: `${ctx.incident.symptoms[0]} — acting proactively before it becomes customer-facing`,
      model_confidence: "medium",
      evidence_coverage: "medium",
      alternative_hypotheses: [{ hypothesis: "Trend self-corrects without intervention", confidence: "low" }],
      recommended_action: {
        type: "restart_service",
        target: { service: ctx.incident.service, environment: ctx.incident.environment },
        rationale: "Proactively restart to reset the leaking resource before it exhausts and causes real customer impact",
      },
      risk: ctx.incident.environment === "production" ? "medium" : "low",
      human_approval_required: ctx.incident.environment === "production",
    };
  }

  private async diagnoseSecurityIncident(ctx: ToolContext, call: ToolCaller, toolCalls: ToolCallLog[]): Promise<RawDiagnosis> {
    const traffic = await call("get_traffic_pattern");
    const threatIntel = await call("get_threat_intel");
    const metrics = await call("get_metrics");

    const trafficPoints = (traffic.data as { time: string; requests_per_minute: number }[]) ?? [];
    const suspiciousIps = (threatIntel.data as { ip: string; requests_per_minute: number; threat_score: number }[]) ?? [];
    const metricList = (metrics.data as { metric: string; value: number }[]) ?? [];
    const errorRate = metricList.find((m) => m.metric === "http_5xx_rate")?.value ?? 0;

    const baseline = trafficPoints[0]?.requests_per_minute ?? 0;
    const latest = trafficPoints[trafficPoints.length - 1]?.requests_per_minute ?? 0;
    const spikeMultiple = baseline > 0 ? latest / baseline : 1;

    const supporting_evidence: Evidence[] = [];
    const contradicting_evidence: Evidence[] = [];
    const missing_evidence: string[] = ["distributed trace (get_trace not available in this environment)"];

    if (spikeMultiple > 3) {
      supporting_evidence.push({
        kind: "fact",
        source_tool: "get_traffic_pattern",
        summary: `Inbound traffic rose ${spikeMultiple.toFixed(1)}x over the last ~10 minutes (${baseline} -> ${latest} req/min)`,
        timestamp: new Date().toISOString(),
      });
    }
    if (suspiciousIps.length > 0) {
      supporting_evidence.push({
        kind: "fact",
        source_tool: "get_threat_intel",
        summary: `${suspiciousIps.length} source IPs flagged with high threat scores, top: ${suspiciousIps[0].ip} (score ${suspiciousIps[0].threat_score}, ${suspiciousIps[0].requests_per_minute} req/min)`,
        timestamp: new Date().toISOString(),
      });
    } else {
      missing_evidence.push("no currently-flagged suspicious IPs — traffic pattern alone is not conclusive of an attack");
    }
    if (errorRate > 5) {
      supporting_evidence.push({
        kind: "fact",
        source_tool: "get_metrics",
        summary: `HTTP 5xx rate elevated at ${errorRate}% under the increased load`,
        timestamp: new Date().toISOString(),
      });
    } else {
      contradicting_evidence.push({
        kind: "fact",
        source_tool: "get_metrics",
        summary: `HTTP 5xx rate not yet elevated (${errorRate}%) despite the traffic spike`,
        timestamp: new Date().toISOString(),
      });
    }

    const strongSignal = spikeMultiple > 3 && suspiciousIps.length > 0;

    if (strongSignal) {
      return {
        supporting_evidence,
        contradicting_evidence,
        missing_evidence,
        tool_calls: toolCalls,
        primary_hypothesis: `Coordinated bot traffic from ${suspiciousIps.length} identified source IPs is driving the load spike on ${ctx.incident.service}`,
        model_confidence: "medium",
        evidence_coverage: "high",
        alternative_hypotheses: [{ hypothesis: "Organic traffic surge (e.g. a marketing campaign)", confidence: "low" }],
        recommended_action: {
          type: "block_traffic",
          target: { service: ctx.incident.service, environment: ctx.incident.environment },
          params: { ips: suspiciousIps.map((ip) => ip.ip) },
          rationale: `Block the ${suspiciousIps.length} flagged IPs at the edge — they account for the majority of the abnormal request volume and match known bot request signatures`,
        },
        risk: "low",
        human_approval_required: false,
      };
    }

    return {
      supporting_evidence,
      contradicting_evidence,
      missing_evidence,
      tool_calls: toolCalls,
      primary_hypothesis: "Traffic pattern is anomalous but not conclusively malicious",
      model_confidence: "low",
      evidence_coverage: "medium",
      alternative_hypotheses: [],
      recommended_action: {
        type: "no_action",
        target: { service: ctx.incident.service, environment: ctx.incident.environment },
        rationale: "Insufficient corroborating evidence (traffic spike without flagged IPs or error-rate impact) to justify blocking traffic",
      },
      risk: "low",
      human_approval_required: false,
    };
  }

  private async diagnoseDeploymentRegression(ctx: ToolContext, call: ToolCaller, toolCalls: ToolCallLog[]): Promise<RawDiagnosis> {
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
