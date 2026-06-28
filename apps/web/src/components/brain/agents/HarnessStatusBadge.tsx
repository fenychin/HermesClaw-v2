"use client";

import { cn } from "@/lib/utils";
import type { HarnessStatusValue } from "@/types";

/**
 * Harness 治理状态色阶徽章
 *
 * 与 AutomationLevelBadge 保持一致的视觉风格。
 * 映射 HarnessProposal.status → 中文标签 + 颜色方案。
 */
export const HARNESS_STATUS_META: Record<
  HarnessStatusValue,
  { label: string; className: string }
> = {
  draft: {
    label: "草稿",
    className:
      "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  },
  pending: {
    label: "待审批",
    className:
      "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700",
  },
  approved: {
    label: "已批准",
    className:
      "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-700",
  },
  canary: {
    label: "灰度中",
    className:
      "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/40 dark:text-purple-400 dark:border-purple-700",
  },
  active: {
    label: "生效中",
    className:
      "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700",
  },
  deprecated: {
    label: "已弃用",
    className:
      "bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700",
  },
  rolled_back: {
    label: "已回滚",
    className:
      "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700",
  },
  none: {
    label: "无治理",
    className:
      "bg-muted/50 text-muted-foreground border-border dark:bg-muted/30",
  },
};

interface HarnessStatusBadgeProps {
  status: HarnessStatusValue;
  size?: "sm" | "md";
  className?: string;
}

export function HarnessStatusBadge({
  status,
  size = "md",
  className,
}: HarnessStatusBadgeProps) {
  const meta = HARNESS_STATUS_META[status] ?? HARNESS_STATUS_META.none;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap",
        size === "sm" ? "px-1.5 py-px text-[10px]" : "px-2.5 py-0.5 text-[11px]",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
