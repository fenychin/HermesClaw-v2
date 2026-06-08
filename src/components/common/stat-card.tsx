import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  /** 趋势文案，如 "+12%" */
  trend?: string;
  /** 趋势语义，决定文字颜色 */
  trendTone?: "success" | "warning" | "danger" | "muted";
}

/** 指标卡：用于动态大盘 / 外贸经营概览 */
export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendTone = "muted",
}: StatCardProps) {
  return (
    <div className="border-border bg-card rounded-2xl border p-5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">{label}</span>
        {Icon ? <Icon className="text-hint size-4" /> : null}
      </div>
      <div className="text-foreground mt-3 text-2xl font-semibold">{value}</div>
      {trend ? (
        <div
          className={cn(
            "mt-1 text-xs",
            trendTone === "success" && "text-success",
            trendTone === "warning" && "text-warning",
            trendTone === "danger" && "text-danger",
            trendTone === "muted" && "text-hint",
          )}
        >
          {trend}
        </div>
      ) : null}
    </div>
  );
}
