import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Typography } from "@mui/material";
import { getSecurityTraffic } from "../api/client";

function BotAttackChart({ service = "checkout-service", environment = "production" }) {
  const [traffic, setTraffic] = useState([]);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const refresh = () => {
      getSecurityTraffic(service, environment)
        .then((d) => {
          setTraffic(d.traffic.map((p) => ({ time: p.time, traffic: p.requests_per_minute })));
          setBlocked(d.blocked);
        })
        .catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [service, environment]);

  return (
    <div>
      <Typography variant="h6" gutterBottom style={{ color: "white" }}>
        🤖 Inbound Traffic — {service}
      </Typography>
      <Typography variant="caption" style={{ color: blocked ? "#22c55e" : "#94a3b8" }}>
        {blocked ? "Normal — no suspicious traffic detected" : "Live (mock security provider)"}
      </Typography>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={traffic}>
          <CartesianGrid stroke="#334155" />
          <XAxis dataKey="time" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip />
          <Line type="monotone" dataKey="traffic" stroke={blocked ? "#22c55e" : "#ef4444"} strokeWidth={3} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default BotAttackChart;
