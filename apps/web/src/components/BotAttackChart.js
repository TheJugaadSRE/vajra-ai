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

const data = [
  { time: "10:00", traffic: 200 },
  { time: "10:05", traffic: 250 },
  { time: "10:10", traffic: 400 },
  { time: "10:15", traffic: 1200 },
  { time: "10:20", traffic: 2800 },
  { time: "10:25", traffic: 3500 },
];

function BotAttackChart() {
  return (
    <div>
      <Typography variant="h6" gutterBottom style={{ color: "white" }}>
        🤖 Suspicious Traffic Spike
      </Typography>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid stroke="#334155" />
          <XAxis dataKey="time" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="traffic"
            stroke="#ef4444"
            strokeWidth={3}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default BotAttackChart;