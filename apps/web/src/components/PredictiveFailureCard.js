import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardContent, Typography } from "@mui/material";
import { dismissPrediction, getPredictions, investigatePrediction } from "../api/client";

const CONFIDENCE_COLOR = { high: "#22c55e", medium: "#eab308", low: "#94a3b8" };

export default function PredictiveFailureCard() {
  const [predictions, setPredictions] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const navigate = useNavigate();

  const refresh = useCallback(() => {
    getPredictions().then(setPredictions).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  const investigate = async (id) => {
    setBusyId(id);
    try {
      const { incident } = await investigatePrediction(id);
      navigate(`/incident/${incident.incident_id}`);
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (id) => {
    setBusyId(id);
    try {
      await dismissPrediction(id);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const active = predictions.filter((p) => p.status !== "DISMISSED");

  return (
    <Card style={{ backgroundColor: "#0f172a", color: "white" }}>
      <CardContent>
        <Typography variant="h6">🔮 Predictive Failure Engine</Typography>
        <Typography variant="caption" style={{ color: "#64748b", display: "block", marginTop: "4px" }}>
          Statistical trend extrapolation on recent metric history — not a trained model. Confidence reflects trend fit, not outage probability.
        </Typography>

        {active.length === 0 && (
          <Typography style={{ marginTop: "12px", color: "#64748b" }}>No metrics currently trending toward a threshold breach</Typography>
        )}

        {active.map((p) => (
          <div key={p.prediction_id} style={{ marginTop: "14px", paddingBottom: "10px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <Typography style={{ color: "white" }}>
              <b>{p.service}</b> · {p.metric} {p.direction === "decreasing" ? "draining" : "climbing"} toward {p.threshold}
            </Typography>
            <Typography style={{ color: "#94a3b8", fontSize: "13px", marginTop: "2px" }}>
              Currently {p.current_value} — projected breach in ~{p.minutes_until_breach} min (
              <span style={{ color: CONFIDENCE_COLOR[p.confidence] }}>{p.confidence} confidence</span>, trend fit R²={p.fit_r_squared.toFixed(2)})
            </Typography>

            {p.status === "WARNING" && (
              <Button size="small" variant="contained" color="warning" style={{ marginTop: "8px", marginRight: "8px" }} disabled={busyId === p.prediction_id} onClick={() => investigate(p.prediction_id)}>
                Investigate now
              </Button>
            )}
            {p.status === "WARNING" && (
              <Button size="small" variant="outlined" style={{ marginTop: "8px", color: "#94a3b8", borderColor: "#334155" }} disabled={busyId === p.prediction_id} onClick={() => dismiss(p.prediction_id)}>
                Dismiss
              </Button>
            )}
            {p.status === "INVESTIGATING" && (
              <Typography
                style={{ marginTop: "8px", color: "#38bdf8", cursor: "pointer", textDecoration: "underline", fontSize: "13px" }}
                onClick={() => navigate(`/incident/${p.linked_incident_id}`)}
              >
                Being investigated — view incident {p.linked_incident_id}
              </Typography>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
