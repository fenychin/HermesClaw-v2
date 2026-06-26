"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * AGENTS.md §5.2 自动化授权等级（L1–L4）徽章
 *
 * 与 components/common/agent-status-badge.tsx 中 AUTOMATION_LEVEL_META 的区别：
 * 本组件采用 **色阶语义**：L1 灰 → L2 蓝 → L3 橙 → L4 红，
 * 符合 §5.2 授权等级示例中对高风险等级的视觉强调要求。
 */
export const AUTOMATION_LEVEL_META_V2: Record<
  string,
  {
    label: string
    short: string
    className: string
    desc: string
    tooltip: string
  }
> = {
  L1: {
    label: "完全自动",
    short: "L1",
    className:
      "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    desc: "AI 生成方案，人类手工执行",
    tooltip: "L1 · 仅建议级：AI 生成方案，人类手工执行。适用于无副作用的读操作与分类任务。",
  },
  L2: {
    label: "建议确认",
    short: "L2",
    className:
      "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-700",
    desc: "AI 生成，人工点按触发执行",
    tooltip: "L2 · 半自动：AI 生成方案，人工点按触发执行。适用于邮件撰写、客户分析等标准输出类任务。",
  },
  L3: {
    label: "⚠ 需人工确认",
    short: "L3",
    className:
      "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700",
    desc: "高风险操作需人工二次确认",
    tooltip:
      "L3 · 高风险自动化：自动执行低风险动作，高风险动作需审批。适用于报价发送、合同生成等涉及资金或信用的决策任务。",
  },
  L4: {
    label: "🔒 人工执行",
    short: "L4",
    className:
      "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700",
    desc: "永不自动执行，须人工发起",
    tooltip:
      "L4 · 最高安全级：全部动作须人工发起。适用于资金划拨、合约签署、删除客户数据等不可逆操作。默认禁止。",
  },
};

interface AutomationLevelBadgeProps {
  level: string
  className?: string
  showLabel?: boolean
  showDesc?: boolean
  showTooltip?: boolean
}

export function AutomationLevelBadge({
  level,
  className,
  showLabel = true,
  showDesc = false,
  showTooltip = false,
}: AutomationLevelBadgeProps) {
  const meta = AUTOMATION_LEVEL_META_V2[level] ?? {
    label: level,
    short: level,
    className:
      "bg-muted/50 text-muted-foreground border-border",
    desc: "",
    tooltip: "",
  };

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        meta.className,
        className,
      )}
    >
      <span className="font-mono font-bold">{meta.short}</span>
      {showLabel && <span>{meta.label}</span>}
    </span>
  );

  if (showDesc && meta.desc) {
    return (
      <div className="inline-flex items-center gap-2">
        {showTooltip && meta.tooltip ? (
          <Tooltip>
            <TooltipTrigger>{badge}</TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {meta.tooltip}
            </TooltipContent>
          </Tooltip>
        ) : (
          badge
        )}
        <span className="text-hint text-xs">{meta.desc}</span>
      </div>
    );
  }

  if (showTooltip && meta.tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {meta.tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}
