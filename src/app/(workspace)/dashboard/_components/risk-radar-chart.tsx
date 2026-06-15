"use client";

/**
 * 风险雷达图 — 五维外贸风险多维评估
 * —— 基于 Recharts RadarChart，展示汇率/关税/物流/竞争/市场 五个维度的风险评分。
 * —— 雷达填充使用 var(--chart-1) 半透明，刻度文字使用 var(--muted-foreground)。
 * —— 每维度附带趋势箭头（↑趋势恶化 / ↓趋势好转）。
 */
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import type { RiskDimension } from "@/types/dashboard";

export interface RiskRadarChartProps {
  data: RiskDimension[];
  className?: string;
}

export default function RiskRadarChart({
  data,
  className,
}: RiskRadarChartProps) {
  // 转换数据为 Recharts 格式：[{ dimension: '汇率风险', score: 72 }, ...]
  const chartData = data.map((d) => ({
    dimension: d.label,
    score: d.score,
    trend: d.trend,
  }));

  // 空数据状态
  if (data.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-hint text-xs bg-card rounded-2xl border border-border",
          className,
        )}
        style={{ minHeight: 280 }}
      >
        <p>暂无风险数据</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-card rounded-2xl border border-border p-4",
        className,
      )}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-foreground font-semibold text-sm">五维风险雷达</h3>
        <span className="text-hint text-[10px]">近 30 天情报聚合</span>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <RadarChart
          cx="50%"
          cy="50%"
          outerRadius="70%"
          data={chartData}
          margin={{ top: 10, right: 20, bottom: 0, left: 20 }}
        >
          <PolarGrid
            stroke="var(--border)"
            strokeWidth={0.5}
            strokeDasharray="3 3"
          />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontWeight: 500 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={false}
            axisLine={false}
          />
          <Radar
            name="风险评分"
            dataKey="score"
            stroke="var(--chart-1)"
            fill="var(--chart-1)"
            fillOpacity={0.15}
            strokeWidth={1.5}
            dot={{
              r: 3,
              fill: "var(--chart-1)",
              stroke: "var(--card)",
              strokeWidth: 1,
            }}
            activeDot={{
              r: 5,
              fill: "var(--chart-1)",
              stroke: "var(--foreground)",
              strokeWidth: 1.5,
            }}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* 底部图例 */}
      <div className="flex items-center justify-center gap-4 mt-1">
        <div className="flex items-center gap-1">
          <span className="text-danger text-[10px]">↑</span>
          <span className="text-hint text-[10px]">风险上升</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-success text-[10px]">↓</span>
          <span className="text-hint text-[10px]">风险下降</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-hint text-[10px]">→</span>
          <span className="text-hint text-[10px]">持平</span>
        </div>
      </div>
    </div>
  );
}
