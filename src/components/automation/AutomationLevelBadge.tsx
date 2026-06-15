"use client"

/**
 * AutomationLevelBadge —— L1/L2/L3/L4 等级徽章
 *
 * 颜色系：L1=emerald（受人监督，最安全）/ L2=sky / L3=amber（高危，需审批）/ L4=rose（全自主，仅白名单）
 */

import type { AutomationLevel } from "@hermesclaw/event-contracts"

interface AutomationLevelBadgeProps {
  level: AutomationLevel
  size?: "sm" | "md"
  className?: string
}

const LEVEL_STYLE: Record<AutomationLevel, string> = {
  L1: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-700",
  L2: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-700",
  L3: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-700",
  L4: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-700",
}

const LEVEL_LABEL: Record<AutomationLevel, string> = {
  L1: "L1 · 全监督",
  L2: "L2 · 半自动",
  L3: "L3 · 高自主",
  L4: "L4 · 全自主",
}

export function AutomationLevelBadge({
  level,
  size = "md",
  className = "",
}: AutomationLevelBadgeProps) {
  const sizeCls =
    size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${LEVEL_STYLE[level]} ${sizeCls} ${className}`}
    >
      {LEVEL_LABEL[level]}
    </span>
  )
}
