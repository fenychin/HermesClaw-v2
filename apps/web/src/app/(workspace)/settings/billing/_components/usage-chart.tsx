"use client";

import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

interface UsageData {
  date: string;
  credits: number;
}

export default function UsageChart({ data }: { data: UsageData[] }) {
  return (
    <div className="w-full h-[300px] bg-[#111111] border border-[#262626] rounded-[16px] p-5 relative overflow-hidden">
      <div className="text-[#F5F5F5] text-sm font-semibold mb-5 select-none">
        本周期每日使用量
      </div>
      <div className="w-full h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorCredits" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6D5EF9" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6D5EF9" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F1F1F" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#7A7A7A"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              dy={10}
            />
            <YAxis
              stroke="#7A7A7A"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              dx={-5}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#171717",
                border: "1px solid #262626",
                borderRadius: "12px",
                fontSize: "11px",
                color: "#F5F5F5",
              }}
              labelStyle={{ color: "#B3B3B3", fontWeight: 600, marginBottom: "4px" }}
              itemStyle={{ color: "#6D5EF9" }}
              cursor={{ stroke: "#6D5EF9", strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            <Area
              type="monotone"
              dataKey="credits"
              name="消耗积分"
              stroke="#6D5EF9"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorCredits)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
