import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardContent, Chip, Paper, Typography } from "@mui/material";
import { listIncidents, runDemoScenario } from "../api/client";
import { SEVERITY_COLOR, SEVERITY_LABEL, STATUS_COLOR } from "../statusColors";
import BotAttackChart from "../components/BotAttackChart";
import BotThreatIntel from "../components/BotThreatIntel";
import RevenueImpact from "../components/RevenueImpact";

const panelStyle = {
  padding: "18px",
  background: "linear-gradient(145deg,#0f172a,#1e293b)",
  color: "white",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  border: "1px solid rgba(255,255,255,0.05)",
  marginBottom: "20px",
};

export default function Dashboard() {
  const [incidents, setIncidents] = useState([]);
  const [starting, setStarting] = useState(null);
  const navigate = useNavigate();

  const refresh = useCallback(() => {
    listIncidents().then(setIncidents).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  const startDemo = async (scenario) => {
    setStarting(scenario);
    try {
      await runDemoScenario(scenario);
    } finally {
      setTimeout(() => setStarting(null), 1000);
    }
  };

  return (
    <div style={{ backgroundColor: "#0f172a", minHeight: "100vh", padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ color: "white", margin: 0 }}>⚡ VAJRA AI — Incident Control Plane</h1>
          <p style={{ color: "#94a3b8", marginTop: "5px" }}>DETECT → CORRELATE → DIAGNOSE → POLICY → APPROVE → EXECUTE → VERIFY → MEMORY</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Button variant="contained" color="error" onClick={() => startDemo("checkout-incident")} disabled={!!starting}>
            {starting === "checkout-incident" ? "Starting…" : "Run Deployment Incident"}
          </Button>
          <Button variant="contained" color="warning" onClick={() => startDemo("bot-attack-incident")} disabled={!!starting}>
            {starting === "bot-attack-incident" ? "Starting…" : "Run Bot Attack Scenario"}
          </Button>
        </div>
      </div>

      <Paper style={panelStyle}>
        <Typography variant="h6" gutterBottom>
          Active &amp; recent incidents
        </Typography>
        {incidents.length === 0 && (
          <Typography style={{ color: "#64748b" }}>
            No incidents yet — click a scenario button above to simulate a production incident.
          </Typography>
        )}
        {incidents.map((incident) => (
          <Card
            key={incident.incident_id}
            onClick={() => navigate(`/incident/${incident.incident_id}`)}
            style={{
              marginBottom: "10px",
              backgroundColor: "#020617",
              borderLeft: `5px solid ${SEVERITY_COLOR[incident.severity]}`,
              cursor: "pointer",
            }}
          >
            <CardContent style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <Typography variant="subtitle2" style={{ color: "#94a3b8" }}>
                  {incident.incident_id} — {incident.service} ({incident.environment})
                </Typography>
                <Typography style={{ color: "white", marginTop: "4px" }}>{incident.title}</Typography>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <Chip label={SEVERITY_LABEL[incident.severity]} style={{ backgroundColor: SEVERITY_COLOR[incident.severity], color: "white" }} size="small" />
                <Chip label={incident.status} style={{ backgroundColor: STATUS_COLOR[incident.status], color: "white" }} size="small" />
              </div>
            </CardContent>
          </Card>
        ))}
      </Paper>

      <Typography variant="overline" style={{ color: "#64748b" }}>
        Security intelligence &amp; business impact — live, backed by mock providers (real integrations are Phase 2+)
      </Typography>
      <div style={{ display: "flex", gap: "20px", marginTop: "10px", flexWrap: "wrap" }}>
        <Paper style={{ ...panelStyle, flex: 1, minWidth: "320px" }}>
          <BotAttackChart />
        </Paper>
        <Paper style={{ ...panelStyle, flex: 1, minWidth: "320px" }}>
          <BotThreatIntel />
        </Paper>
        <Paper style={{ ...panelStyle, flex: 1, minWidth: "260px" }}>
          <RevenueImpact />
        </Paper>
      </div>
    </div>
  );
}
