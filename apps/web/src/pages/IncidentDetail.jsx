import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Chip, Paper, Typography } from "@mui/material";
import { approveIncident, getIncident, getSimilarIncidents, rejectIncident } from "../api/client";
import { SEVERITY_COLOR, SEVERITY_LABEL, STATUS_COLOR } from "../statusColors";

const panel = {
  padding: "18px",
  background: "linear-gradient(145deg,#0f172a,#1e293b)",
  color: "white",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.05)",
  marginBottom: "20px",
};

const TERMINAL_STATUSES = ["RESOLVED", "CLOSED", "ESCALATED"];

function Section({ title, children }) {
  return (
    <Paper style={panel}>
      <Typography variant="subtitle1" style={{ color: "#94a3b8", letterSpacing: "0.5px", marginBottom: "10px" }}>
        {title.toUpperCase()}
      </Typography>
      {children}
    </Paper>
  );
}

function Tag({ text, color }) {
  return <Chip label={text} size="small" style={{ backgroundColor: color, color: "white", marginRight: "6px", marginBottom: "6px" }} />;
}

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [incident, setIncident] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getIncident(id).then(setIncident).catch(() => {});
    getSimilarIncidents(id).then(setSimilar).catch(() => setSimilar([]));
  }, [id]);

  useEffect(() => {
    refresh();
    const interval = setInterval(() => {
      if (!TERMINAL_STATUSES.includes(incident?.status)) refresh();
    }, 2000);
    return () => clearInterval(interval);
  }, [refresh, incident?.status]);

  if (!incident) {
    return (
      <div style={{ backgroundColor: "#0f172a", minHeight: "100vh", padding: "24px", color: "white" }}>
        Loading incident…
      </div>
    );
  }

  const { diagnosis, policy_decision, approval, execution, verification, service_catalog } = incident;

  const handleDecision = async (decision) => {
    setBusy(true);
    try {
      const decided_by = "engineer@vajra.example";
      if (decision === "approve") await approveIncident(id, decided_by, "Approved via VAJRA UI");
      else await rejectIncident(id, decided_by, "Rejected via VAJRA UI");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const downtimeMinutes = Math.max(0, (new Date(incident.updated_at) - new Date(incident.created_at)) / 60000);
  const estimatedImpact = service_catalog ? Math.round(service_catalog.revenue_per_minute_downtime_usd * downtimeMinutes) : null;

  return (
    <div style={{ backgroundColor: "#0f172a", minHeight: "100vh", padding: "24px" }}>
      <Button onClick={() => navigate("/")} style={{ color: "#94a3b8", marginBottom: "10px" }}>
        ← Back to dashboard
      </Button>

      <Paper style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <Typography variant="h5" style={{ color: "white" }}>
              {incident.incident_id} — {incident.title}
            </Typography>
            <Typography style={{ color: "#94a3b8", marginTop: "4px" }}>
              {incident.service} · {incident.environment}
              {service_catalog ? ` · owned by ${service_catalog.owner} · ${service_catalog.criticality}` : ""}
            </Typography>
          </div>
          <div>
            <Tag text={SEVERITY_LABEL[incident.severity]} color={SEVERITY_COLOR[incident.severity]} />
            <Tag text={incident.status} color={STATUS_COLOR[incident.status]} />
          </div>
        </div>
      </Paper>

      <Section title="Timeline">
        {incident.timeline.map((entry, i) => (
          <Typography key={i} style={{ color: "#cbd5e1", fontSize: "14px", marginBottom: "4px" }}>
            <span style={{ color: "#64748b" }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>{" "}
            <b style={{ color: "#94a3b8" }}>[{entry.stage}/{entry.actor}]</b> {entry.message}
          </Typography>
        ))}
      </Section>

      {diagnosis ? (
        <>
          <Section title="Root cause hypothesis (FACT vs HYPOTHESIS)">
            <Typography style={{ color: "white", marginBottom: "8px" }}>{diagnosis.primary_hypothesis}</Typography>
            <Typography style={{ color: "#94a3b8", fontSize: "13px" }}>
              Model confidence: <b>{diagnosis.model_confidence}</b> (self-reported, not a calibrated probability) · Evidence
              coverage: <b>{diagnosis.evidence_coverage}</b> · Reasoner: {diagnosis.reasoner}
            </Typography>
            {diagnosis.alternative_hypotheses.length > 0 && (
              <div style={{ marginTop: "10px" }}>
                <Typography style={{ color: "#64748b", fontSize: "13px" }}>Alternative hypotheses considered:</Typography>
                {diagnosis.alternative_hypotheses.map((h, i) => (
                  <Typography key={i} style={{ color: "#94a3b8", fontSize: "13px" }}>
                    • {h.hypothesis} ({h.confidence} confidence)
                  </Typography>
                ))}
              </div>
            )}
          </Section>

          <Section title="Evidence">
            <Typography style={{ color: "#22c55e", fontSize: "13px", fontWeight: 600 }}>SUPPORTING (facts observed via tool calls)</Typography>
            {diagnosis.supporting_evidence.map((e, i) => (
              <Typography key={i} style={{ color: "#cbd5e1", fontSize: "14px" }}>
                • [{e.kind}] {e.summary} <span style={{ color: "#64748b" }}>({e.source_tool})</span>
              </Typography>
            ))}
            <Typography style={{ color: "#f97316", fontSize: "13px", fontWeight: 600, marginTop: "10px" }}>CONTRADICTING</Typography>
            {diagnosis.contradicting_evidence.length === 0 && <Typography style={{ color: "#64748b", fontSize: "14px" }}>None found</Typography>}
            {diagnosis.contradicting_evidence.map((e, i) => (
              <Typography key={i} style={{ color: "#cbd5e1", fontSize: "14px" }}>
                • {e.summary} <span style={{ color: "#64748b" }}>({e.source_tool})</span>
              </Typography>
            ))}
            <Typography style={{ color: "#eab308", fontSize: "13px", fontWeight: 600, marginTop: "10px" }}>MISSING EVIDENCE</Typography>
            {diagnosis.missing_evidence.map((m, i) => (
              <Typography key={i} style={{ color: "#cbd5e1", fontSize: "14px" }}>
                • {m}
              </Typography>
            ))}
          </Section>

          <Section title="Recommended action">
            <Typography style={{ color: "white" }}>
              <b>{diagnosis.recommended_action.type}</b> on {diagnosis.recommended_action.target.service}
              {diagnosis.recommended_action.target.version ? ` (v${diagnosis.recommended_action.target.version})` : ""}
            </Typography>
            <Typography style={{ color: "#94a3b8", fontSize: "14px", marginTop: "6px" }}>{diagnosis.recommended_action.rationale}</Typography>
            <div style={{ marginTop: "10px" }}>
              <Tag text={`risk: ${diagnosis.risk}`} color={SEVERITY_COLOR[diagnosis.risk] ?? "#64748b"} />
              {policy_decision && <Tag text={policy_decision.matched_rule} color="#334155" />}
            </div>
            {policy_decision && (
              <Typography style={{ color: "#64748b", fontSize: "13px", marginTop: "6px" }}>Policy: {policy_decision.reason}</Typography>
            )}
          </Section>

          {incident.simulation && (
            <Section title="Digital twin simulation (predicted outcome)">
              <Typography style={{ color: "#64748b", fontSize: "12px", marginBottom: "10px" }}>
                Simulated projection from a deterministic heuristic model — not a trained model or a live topology
                replica. Baseline: {incident.simulation.baseline.error_rate}% error rate, {incident.simulation.baseline.latency_ms}ms latency.
              </Typography>
              {incident.simulation.scenarios.map((s) => (
                <div
                  key={s.action}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography style={{ color: s.action === incident.simulation.recommended_scenario ? "#22c55e" : "#cbd5e1" }}>
                    <b>{s.action}</b>
                    {s.action === incident.simulation.recommended_scenario ? " (recommended)" : ""}
                  </Typography>
                  <Typography style={{ color: "#94a3b8", fontSize: "13px" }}>
                    error: {s.predicted_error_rate}% · latency: {s.predicted_latency_ms}ms · cost: {s.cost_impact}
                  </Typography>
                </div>
              ))}
            </Section>
          )}

          {approval && approval.status === "PENDING" && (
            <Section title="Human approval required">
              <Typography style={{ color: "#eab308", marginBottom: "12px" }}>
                This action requires human approval before it can run against {incident.environment}.
              </Typography>
              <Button variant="contained" color="success" onClick={() => handleDecision("approve")} disabled={busy} style={{ marginRight: "10px" }}>
                Approve {diagnosis.recommended_action.type.replace(/_/g, " ")}
              </Button>
              <Button variant="outlined" color="error" onClick={() => handleDecision("reject")} disabled={busy}>
                Reject
              </Button>
            </Section>
          )}
          {approval && approval.status !== "PENDING" && (
            <Section title="Approval">
              <Typography style={{ color: "white" }}>
                {approval.status} by {approval.decided_by} at {new Date(approval.decided_at).toLocaleTimeString()}
              </Typography>
              {approval.comment && <Typography style={{ color: "#94a3b8" }}>{approval.comment}</Typography>}
            </Section>
          )}

          {execution && (
            <Section title="Execution">
              <Typography style={{ color: "white" }}>
                {execution.action}: <b>{execution.status}</b>
              </Typography>
              <Typography style={{ color: "#94a3b8", fontSize: "14px" }}>{execution.result}</Typography>
            </Section>
          )}

          {verification && (
            <Section title="Verification">
              <Typography style={{ color: verification.status === "RECOVERED" ? "#22c55e" : "#dc2626" }}>{verification.status}</Typography>
              <Typography style={{ color: "#94a3b8", fontSize: "13px", marginTop: "6px" }}>
                Before: {Object.entries(verification.metrics_before).map(([k, v]) => `${k}=${v}`).join(", ")}
              </Typography>
              <Typography style={{ color: "#94a3b8", fontSize: "13px" }}>
                After: {Object.entries(verification.metrics_after).map(([k, v]) => `${k}=${v}`).join(", ")}
              </Typography>
            </Section>
          )}
        </>
      ) : (
        <Section title="Diagnosis">
          <Typography style={{ color: "#94a3b8" }}>Investigating — gathering evidence…</Typography>
        </Section>
      )}

      <Section title="Business impact (illustrative)">
        {service_catalog ? (
          <>
            <Typography style={{ color: "white" }}>
              ~{downtimeMinutes.toFixed(1)} minutes since detection × ${service_catalog.revenue_per_minute_downtime_usd}/min
              (static service catalog rate) ≈ <b>${estimatedImpact?.toLocaleString()}</b>
            </Typography>
            <Typography style={{ color: "#64748b", fontSize: "12px", marginTop: "6px" }}>
              Illustrative only — not a modeled financial estimate. Full Business Impact Engine is a roadmap item.
            </Typography>
          </>
        ) : (
          <Typography style={{ color: "#64748b" }}>No service catalog entry for {incident.service}</Typography>
        )}
      </Section>

      <Section title="Related incidents">
        {similar.length === 0 && <Typography style={{ color: "#64748b" }}>No similar past incidents found</Typography>}
        {similar.map((s) => (
          <Typography key={s.incident_id} style={{ color: "#cbd5e1" }}>
            • {s.incident_id} — {s.similarity} similarity, resolved via {s.resolution}
          </Typography>
        ))}
      </Section>
    </div>
  );
}
