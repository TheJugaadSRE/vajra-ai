import { useState } from "react";
import { Button, Typography, Card, CardContent } from "@mui/material";

function BotThreatIntel() {

  const [blocked, setBlocked] = useState(false);

  const suspiciousIPs = [
    { ip: "185.34.12.88", traffic: 12432 },
    { ip: "92.188.44.201", traffic: 9120 },
    { ip: "103.44.21.90", traffic: 8401 },
    { ip: "14.201.90.18", traffic: 7322 },
    { ip: "77.109.12.200", traffic: 6004 }
  ];

  const blockIPs = () => {
    setBlocked(true);
  };

  return (
    <Card style={{ backgroundColor: "#0f172a", color: "white" }}>
      <CardContent>

        <Typography variant="h6">
          🛡 Bot Threat Intelligence
        </Typography>

        {suspiciousIPs.map((item, index) => (
          <Typography key={index} style={{ marginTop: "8px" }}>
            {index + 1}. {item.ip} — {item.traffic.toLocaleString()} req/min
          </Typography>
        ))}

        <Button
          variant="contained"
          color="warning"
          style={{ marginTop: "15px" }}
          onClick={blockIPs}
        >
          Auto Block All
        </Button>

        {blocked && (
          <Typography style={{ marginTop: "10px", color: "#22c55e" }}>
            ✓ WAF rule deployed — 5 IPs blocked
          </Typography>
        )}

      </CardContent>
    </Card>
  );
}

export default BotThreatIntel;