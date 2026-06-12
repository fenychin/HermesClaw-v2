"use client";

/**
 * KPI 对比条 — 展示本周 vs 上周关键指标对比
 * —— 水平进度条样式：当前值 / 变化百分比 / 颜色指示方向。
 * —— 正值绿色进度条向右，负值红色进度条向左。
 */
import { cn } from "@/lib/utils";
import type { KpiComparison } from "@/types/dashboard";

export interface KpiComparisonBarProps {
  data: KpiComparison[];
  className?: string;
}

/** 单条对比 */
function ComparisonRow({ item }: { item: KpiComparison }) {
  const isUp = item.changePercent > 0;
  const isDown = item.changePercent < 0;
  const barColor = isUp ? "var(--success)" : isDown ? "var(--danger)" : "var(--hint)";
  // 进度条宽度：最小 2%，最大 100%
  const barWidth = Math.max(2, Math.min(Math.abs(item.changePercent), 100));

  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0 border-b border-border/40 last:border-b-0">
      {/* 标签 */}
      <span className="text-muted-foreground text-sm min-w-[48px]">{item.label}</span>

      {/* 进度条 */}
      <div className="flex-1 flex items-center gap-2">
        {/* 基准值标签（左侧） */}
        <span className="text-hint text-xs tabular-nums w-10 text-right">
          {item.previous}
        </span>

        {/* 进度条主体 */}
        <div className="relative flex-1 h-1.5 bg-accent rounded-full overflow-hidden">
          <div
            className="absolute top-0 h-full rounded-full transition-all duration-700"
            style={{
              width: `${barWidth}%`,
              backgroundColor: barColor,
              [isDown ? "right" : "left"]: 0,
            }}
          />
        </div>

        {/* 当前值标签（右侧） */}
        <span className="text-foreground text-xs font-semibold tabular-nums w-10">
          {item.current}
        </span>
      </div>

      {/* 变化百分比 + 箭头 */}
      <span
        className={cn(
          "text-xs font-medium tabular-nums min-w-[56px] text-right",
          isUp && "text-success",
          isDown && "text-danger",
          !isUp && !isDown && "text-hint",
        )}
      >
        {isUp ? "↑ +" : isDown ? "↓ " : "→ "}
        {item.changePercent}%
      </span>
    </div>
  );
}

export default function KpiComparisonBar({
  data,
  className,
}: KpiComparisonBarProps) {
  if (data.length === 0) return null;

  return (
    <div
      className={cn(
        "bg-card rounded-2xl border border-border p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-foreground font-semibold text-sm">
          较上周同期
        </h3>
        <span className="text-hint text-[10px]">
          近 7 天 vs 前 7 天
        </span>
      </div>

      {data.map((item) => (
        <ComparisonRow key={item.metric} item={item} />
      ))}
    </div>
  );
}
