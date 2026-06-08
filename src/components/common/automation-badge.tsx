import type { AutomationLevel } from "@/types";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

/** 自动化授权等级 → 文案 + 配色（AGENTS.md §4.7） */
const LEVEL_META: Record<
  AutomationLevel,
  { label: string; className: string }
> = {
  /* L1 全自动：弱提示灰 */
  L1: { label: "L1 全自动", className: "bg-accent text-muted-foreground" },
  /* L2 建议执行：辅助蓝 */
  L2: { label: "L2 建议执行", className: "bg-brand-blue/10 text-brand-blue" },
  /* L3 需人工确认：警告橙 */
  L3: { label: "L3 需人工确认", className: "bg-warning/10 text-warning" },
  /* L4 绝对禁止自动：风险红 */
  L4: { label: "L4 绝对禁止", className: "bg-danger/10 text-danger" },
};

interface AutomationBadgeProps {
  level: AutomationLevel;
  className?: string;
}

/**
 * 自动化授权等级标签
 * —— 用于 Harness 提案审批卡片、智能体动作授权清单的等级展示
 */
export function AutomationBadge({ level, className }: AutomationBadgeProps) {
  const meta = LEVEL_META[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      {level === "L4" ? <Lock className="size-3" /> : null}
      {meta.label}
    </span>
  );
}
