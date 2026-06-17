"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell
} from "recharts";

export interface FunnelChartDatum {
  name: string;
  value: number;
}

const COLORS = ["var(--chart-1)", "var(--chart-3)", "var(--chart-5)"];

export default function FunnelBarChart({ data }: { data: FunnelChartDatum[] }) {
  return (
    <div className="w-full h-[220px] mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 20, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} vertical={true} />
          <XAxis type="number" stroke="var(--hint)" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis
            dataKey="name"
            type="category"
            stroke="var(--hint)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--foreground)",
            }}
          />
          <Bar dataKey="value" name="数量" radius={[0, 4, 4, 0]} barSize={24}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
