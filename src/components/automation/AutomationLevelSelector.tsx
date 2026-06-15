"use client"

/**
 * AutomationLevelSelector —— L1/L2/L3/L4 4-chip 单选
 *
 * —— L4 chip 在 `!l4Allowed` 时 disabled，hover tooltip 解释白名单。
 * —— 选中 L3/L4 时下方 inline 警告条 + Link 跳到 /settings/harness（不预填）。
 * —— 业务上「直接落库 L3/L4」由后端 422 拦截；前端只引导用户走 Harness。
 */

import Link from "next/link"
import type { AutomationLevel } from "@hermesclaw/event-contracts"
import { AlertTriangle, ShieldCheck } from "lucide-react"

interface AutomationLevelSelectorProps {
  value: AutomationLevel
  onChange: (level: AutomationLevel) => void
  disabled?: boolean
  l4Allowed?: boolean
  className?: string
}

const LEVELS: Array<{ key: AutomationLevel; label: string; hint: string }> = [
  { key: "L1", label: "L1 · 全监督", hint: "每步执行均需人工确认" },
  { key: "L2", label: "L2 · 半自动", hint: "可自动执行 read-only / 低风险动作" },
  { key: "L3", label: "L3 · 高自主", hint: "可执行高风险动作（需 Harness 审批）" },
  { key: "L4", label: "L4 · 全自主", hint: "完全自主（仅白名单工作区）" },
]

const STYLE_BASE =
  "relative inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"

const STYLE_ACTIVE: Record<AutomationLevel, string> = {
  L1: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  L2: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  L3: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  L4: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
}

const STYLE_IDLE =
  "border-border bg-card text-muted-foreground hover:bg-muted/40"

export function AutomationLevelSelector({
  value,
  onChange,
  disabled = false,
  l4Allowed = false,
  className = "",
}: AutomationLevelSelectorProps) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LEVELS.map((lvl) => {
          const isActive = value === lvl.key
          const isL4Locked = lvl.key === "L4" && !l4Allowed
          const btnDisabled = disabled || isL4Locked
          const title = isL4Locked
            ? "L4 不在该工作区白名单内（联系平台运营开通）"
            : lvl.hint
          return (
            <button
              key={lvl.key}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={btnDisabled}
              title={title}
              onClick={() => onChange(lvl.key)}
              className={`${STYLE_BASE} ${
                isActive ? STYLE_ACTIVE[lvl.key] : STYLE_IDLE
              }`}
            >
              <span>{lvl.label}</span>
            </button>
          )
        })}
      </div>

      {(value === "L3" || value === "L4") && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/80 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="font-medium">
              升级到 {value} 不能直接落库 —— 必须先在 Harness 创建提案并完成审批。
            </p>
            <p className="text-xs">
              直接保存会被服务端拒绝并返回 422 REQUIRES_HARNESS_APPROVAL。
            </p>
            <Link
              href="/settings/harness"
              className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200"
            >
              <ShieldCheck className="h-3 w-3" />
              前往 Harness 提案面板
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
