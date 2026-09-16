import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Typography, Card, CardContent } from "@mui/material";
import { getSecurityTraffic } from "../api/client";

function BotThreatIntel({ service = "checkout-service", environment = "production" }) {
  const [ips, setIps] = useState([]);
  const [blocked, setBlocked] = useState(false);
  const [relatedIncident, setRelatedIncident] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const refresh = () => {
      getSecurityTraffic(service, environment)
        .then((d) => {
          setIps(d.suspicious_ips);
          setBlocked(d.blocked);
          setRelatedIncident(d.related_incident_id ? { id: d.related_incident_id, status: d.related_incident_status } : null);
        })
        .catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [service, environment]);

  return (
    <Card style={{ backgroundColor: "#0f172a", color: "white" }}>
      <CardContent>
        <Typography variant="h6">🛡 Bot Threat Intelligence — {service}</Typography>

        {ips.length === 0 && !blocked && (
          <Typography style={{ marginTop: "8px", color: "#64748b" }}>No suspicious traffic currently observed</Typography>
        )}

        {ips.map((item, index) => (
          <Typography key={item.ip} style={{ marginTop: "8px" }}>
            {index + 1}. {item.ip} — {item.requests_per_minute.toLocaleString()} req/min (threat score {item.threat_score})
          </Typography>
        ))}

        {blocked && ips.length === 0 && (
          <Typography style={{ marginTop: "10px", color: "#22c55e" }}>✓ WAF rule active — flagged IPs blocked</Typography>
        )}

        {relatedIncident && (
          <Typography
            style={{ marginTop: "15px", color: "#38bdf8", cursor: "pointer", textDecoration: "underline" }}
            onClick={() => navigate(`/incident/${relatedIncident.id}`)}
          >
            View incident {relatedIncident.id} ({relatedIncident.status})
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default BotThreatIntel;
