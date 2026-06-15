"use client";

/**
 * 预测置信度面板 — 展示 AI 推断的趋势预测
 * —— 虚线边框卡片风格，使用 var(--brand-blue) 标识"未来/预测"语义。
 * —— 显示询盘量、汇率等关键指标的短期方向预测及置信度。
 */
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PredictiveIndicator } from "@/types/dashboard";

export interface PredictivePanelProps {
  data: PredictiveIndicator[];
  className?: string;
}

/** 中文指标名映射 */
const METRIC_LABELS: Record<string, string> = {
  inquiry_volume: "询盘量趋势",
  exchange_rate: "汇率走势",
  risk_level: "风险等级",
};

/** 指标图标 */
function MetricIcon({ direction }: { direction: PredictiveIndicator["direction"] }) {
  const cls = "size-4";
  if (direction === "up") return <TrendingUp className={cn(cls, "text-success")} />;
  if (direction === "down") return <TrendingDown className={cn(cls, "text-danger")} />;
  return <Minus className={cn(cls, "text-hint")} />;
}

/** 方向描述文本 */
function directionLabel(direction: PredictiveIndicator["direction"]): string {
  if (direction === "up") return "预计上升";
  if (direction === "down") return "预计下降";
  return "预计持平";
}

/** 置信度色条 */
function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 70 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--hint)";

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-accent rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-hint text-[10px] tabular-nums">{pct}%</span>
    </div>
  );
}

export default function PredictivePanel({
  data,
  className,
}: PredictivePanelProps) {
  if (data.length === 0) {
    return (
      <div
        className={cn(
          "bg-card rounded-2xl border border-dashed border-brand-blue/30 p-4 flex flex-col items-center justify-center gap-2",
          className,
        )}
        style={{ minHeight: 140 }}
      >
        <Sparkles className="size-5 text-hint" />
        <p className="text-hint text-xs text-center">
          积累更多数据后
          <br />
          将展示趋势预测
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-card rounded-2xl border border-dashed border-brand-blue/30 p-4",
        className,
      )}
    >
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="size-4 text-brand-blue" />
        <h3 className="text-foreground font-semibold text-sm">趋势预测</h3>
        <span className="text-hint text-[10px] ml-auto">实验性</span>
      </div>

      {/* 指标列表 */}
      <div className="space-y-3">
        {data.map((indicator) => {
          const label = METRIC_LABELS[indicator.metric] ?? indicator.metric;
          return (
            <div key={indicator.metric}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground text-xs">{label}</span>
                <div className="flex items-center gap-1.5">
                  <MetricIcon direction={indicator.direction} />
                  <span className="text-foreground text-xs font-medium">
                    {directionLabel(indicator.direction)}
                  </span>
                  {indicator.changePercent !== 0 && (
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        indicator.changePercent > 0
                          ? "text-success"
                          : "text-danger",
                      )}
                    >
                      {indicator.changePercent > 0 ? "+" : ""}
                      {indicator.changePercent}%
                    </span>
                  )}
                </div>
              </div>
              <ConfidenceBar confidence={indicator.confidence} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
