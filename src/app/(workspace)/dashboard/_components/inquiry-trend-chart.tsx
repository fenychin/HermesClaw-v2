"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { DailyInquiryPoint } from "@/hooks/use-dashboard-stats";

/**
 * 询盘趋势折线图
 * —— 近 14 天询盘量变化趋势
 * —— 配色使用 var(--chart-1) 等 CSS 变量，禁止硬编码
 * —— 独立组件供 next/dynamic(ssr:false) 懒加载
 */
export default function InquiryTrendChart({
  data,
}: {
  data: DailyInquiryPoint[];
}) {
  // 空数据占位
  if (!data || data.length === 0) {
    return (
      <div className="h-[180px] mt-2 flex items-center justify-center text-hint text-xs bg-accent/5 rounded-xl border border-border/30">
        暂无询盘趋势数据
      </div>
    );
  }

  return (
    <div className="w-full h-[180px] mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            stroke="var(--hint)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="var(--hint)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--foreground)",
              fontSize: "12px",
            }}
            labelFormatter={(label) => `${label}`}
            formatter={(value) => [`${value} 条`, "询盘量"]}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ fill: "var(--chart-1)", r: 3, strokeWidth: 0 }}
            activeDot={{
              fill: "var(--chart-2)",
              r: 5,
              stroke: "var(--chart-1)",
              strokeWidth: 2,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
