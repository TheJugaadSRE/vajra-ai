import { z } from "zod";
import { Tool, ToolContext, ToolResult } from "./types";

const noInput = z.object({}).strict();

function notAvailable(name: string): Tool {
  return {
    name,
    description: `${name} — not available in this environment (no real integration configured)`,
    inputSchema: noInput,
    async execute(): Promise<ToolResult> {
      return { summary: `${name}: not available — no real integration configured for this environment`, data: null };
    },
  };
}

const getMetrics: Tool = {
  name: "get_metrics",
  description: "Get current key metrics (error rate, latency, CPU, DB connection pool) for the incident's service",
  inputSchema: noInput,
  async execute(_input, ctx: ToolContext): Promise<ToolResult> {
    const metrics = await ctx.observability.getMetrics(ctx.incident.service, ctx.incident.environment, 15);
    return {
      summary: metrics.map((m) => `${m.metric}=${m.value}${m.unit}`).join(", "),
      data: metrics,
    };
  },
};

const queryLogs: Tool = {
  name: "query_logs",
  description: "Query recent error/warning logs for the incident's service",
  inputSchema: noInput,
  async execute(_input, ctx: ToolContext): Promise<ToolResult> {
    const logs = await ctx.observability.queryLogs(ctx.incident.service, ctx.incident.environment, "level:ERROR OR level:WARN");
    return { summary: logs.map((l) => `[${l.level}] ${l.message}`).join(" | "), data: logs };
  },
};

const getRecentDeployments: Tool = {
  name: "get_recent_deployments",
  description: "Get deployments to the incident's service in the last N minutes (default 30)",
  inputSchema: z.object({ since_minutes: z.number().optional() }),
  async execute(input, ctx: ToolContext): Promise<ToolResult> {
    const deployments = await ctx.deployment.getRecentDeployments(
      ctx.incident.service,
      ctx.incident.environment,
      input.since_minutes ?? 30
    );
    if (deployments.length === 0) return { summary: "No recent deployments found", data: [] };
    return {
      summary: deployments
        .map((d) => `v${d.version} deployed at ${d.deployed_at} by ${d.deployed_by}: ${d.change_summary}`)
        .join("; "),
      data: deployments,
    };
  },
};

const getServiceDependencies: Tool = {
  name: "get_service_dependencies",
  description: "Get the incident service's dependency graph and their criticality",
  inputSchema: noInput,
  async execute(_input, ctx: ToolContext): Promise<ToolResult> {
    const entry = ctx.knowledge.getServiceCatalogEntry(ctx.incident.service);
    if (!entry) return { summary: "No service catalog entry found", data: null };
    return { summary: entry.dependencies.map((d) => `${d.service} (${d.type}, ${d.criticality})`).join(", "), data: entry.dependencies };
  },
};

const getRecentChanges: Tool = {
  name: "get_recent_changes",
  description: "Alias for get_recent_deployments — configuration/code changes near the incident window",
  inputSchema: noInput,
  async execute(_input, ctx: ToolContext): Promise<ToolResult> {
    return getRecentDeployments.execute({ since_minutes: 60 }, ctx);
  },
};

const getRunbook: Tool = {
  name: "get_runbook",
  description: "Fetch the operational runbook for the incident's service, if one exists",
  inputSchema: noInput,
  async execute(_input, ctx: ToolContext): Promise<ToolResult> {
    const entry = ctx.knowledge.getServiceCatalogEntry(ctx.incident.service);
    if (!entry) return { summary: "No service catalog entry, no runbook reference", data: null };
    const runbook = ctx.knowledge.getRunbook(entry.runbook);
    if (!runbook) return { summary: `No runbook found for id ${entry.runbook}`, data: null };
    return { summary: `Runbook "${entry.runbook}" found`, data: runbook };
  },
};

const getSimilarIncidents: Tool = {
  name: "get_similar_incidents",
  description: "Find previously resolved incidents with similar symptoms on the same service",
  inputSchema: noInput,
  async execute(_input, ctx: ToolContext): Promise<ToolResult> {
    const similar = await ctx.memory.findSimilar(ctx.incident);
    if (similar.length === 0) return { summary: "No similar past incidents found", data: [] };
    return {
      summary: similar.map((s) => `${s.incident_id} (${s.similarity} similarity, resolved via ${s.resolution})`).join("; "),
      data: similar,
    };
  },
};

const getServiceOwner: Tool = {
  name: "get_service_owner",
  description: "Get the owning team and criticality tier for the incident's service",
  inputSchema: noInput,
  async execute(_input, ctx: ToolContext): Promise<ToolResult> {
    const entry = ctx.knowledge.getServiceCatalogEntry(ctx.incident.service);
    if (!entry) return { summary: "No service catalog entry found", data: null };
    return { summary: `${entry.service} is owned by ${entry.owner} (${entry.criticality})`, data: entry };
  },
};

const getOncall: Tool = {
  name: "get_oncall",
  description: "Get the current on-call contact for the incident's service",
  inputSchema: noInput,
  async execute(_input, ctx: ToolContext): Promise<ToolResult> {
    const entry = ctx.knowledge.getServiceCatalogEntry(ctx.incident.service);
    if (!entry) return { summary: "No service catalog entry found", data: null };
    return { summary: entry.oncall, data: { oncall: entry.oncall } };
  },
};

const getTrafficPattern: Tool = {
  name: "get_traffic_pattern",
  description: "Get recent inbound request-rate history for the incident's service, to spot traffic spikes",
  inputSchema: noInput,
  async execute(_input, ctx: ToolContext): Promise<ToolResult> {
    const points = await ctx.security.getTrafficPattern(ctx.incident.service, ctx.incident.environment);
    return { summary: points.map((p) => `${p.time}: ${p.requests_per_minute} req/min`).join(", "), data: points };
  },
};

const getThreatIntel: Tool = {
  name: "get_threat_intel",
  description: "Get suspicious/high-volume source IPs currently hitting the incident's service",
  inputSchema: noInput,
  async execute(_input, ctx: ToolContext): Promise<ToolResult> {
    const ips = await ctx.security.getSuspiciousIps(ctx.incident.service, ctx.incident.environment);
    if (ips.length === 0) return { summary: "No suspicious IPs currently flagged", data: [] };
    return {
      summary: ips.map((ip) => `${ip.ip} (${ip.requests_per_minute} req/min, threat score ${ip.threat_score})`).join("; "),
      data: ips,
    };
  },
};

export function buildToolRegistry(): Map<string, Tool> {
  const tools: Tool[] = [
    getMetrics,
    queryLogs,
    notAvailable("get_trace"),
    getRecentDeployments,
    notAvailable("get_k8s_events"),
    notAvailable("get_pod_status"),
    getServiceDependencies,
    getRecentChanges,
    getRunbook,
    getTrafficPattern,
    getThreatIntel,
    getSimilarIncidents,
    getServiceOwner,
    getOncall,
    notAvailable("get_config_changes"),
  ];
  return new Map(tools.map((t) => [t.name, t]));
}
