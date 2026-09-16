import { useEffect, useState } from "react";
import { Typography, Card, CardContent } from "@mui/material";
import { getBusinessImpact } from "../api/client";

function RevenueImpact() {
  const [impact, setImpact] = useState(null);

  useEffect(() => {
    const refresh = () => getBusinessImpact().then(setImpact).catch(() => {});
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card style={{ backgroundColor: "#0f172a", color: "white", minHeight: "150px" }}>
      <CardContent>
        <Typography variant="h6">💰 Revenue Protection</Typography>

        {!impact || impact.breakdown.length === 0 ? (
          <Typography variant="body2" style={{ marginTop: "10px", color: "#64748b" }}>
            No incidents tracked yet
          </Typography>
        ) : (
          <>
            <Typography variant="h5" style={{ marginTop: "12px", color: impact.active_impact_usd > 0 ? "#dc2626" : "#22c55e" }}>
              ${impact.active_impact_usd.toLocaleString()} at risk right now
            </Typography>
            <Typography variant="body2" style={{ marginTop: "8px" }}>
              ${impact.total_impact_usd.toLocaleString()} total estimated impact across {impact.breakdown.length} incident(s)
            </Typography>
            <Typography variant="caption" style={{ display: "block", marginTop: "10px", color: "#64748b" }}>
              {impact.note}
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default RevenueImpact;
