import type { RiskLevel } from "@/types";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

/** 风险等级 → 显示标签映射 */
const RISK_LABEL: Record<RiskLevel, string> = {
  high: "高风险",
  mid: "中风险",
  low: "低风险",
};

interface RiskBadgeProps {
  level: RiskLevel;
  className?: string;
}

/**
 * 风险等级标签
 * —— 用于 Harness 提案、市场情报等场景的风险评级展示
 */
export function RiskBadge({ level, className }: RiskBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        /* 高风险：红色背景 + AlertTriangle 图标 */
        level === "high" && "bg-danger/10 text-danger",
        /* 中风险：橙色背景 */
        level === "mid" && "bg-warning/10 text-warning",
        /* 低风险：绿色背景 */
        level === "low" && "bg-success/10 text-success",
        className,
      )}
    >
      {level === "high" ? <AlertTriangle className="size-3" /> : null}
      {RISK_LABEL[level]}
    </span>
  );
}
