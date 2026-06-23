/**
 * ThreatAlertModal — 战术告警浮层
 *
 * 当收到 intel.alert.tactical（P0 优先级）时弹出。
 * 显示告警详情 + 确认按钮。不在此组件做威胁判定——只展示服务端结果。
 */
"use client"

import React, { useEffect, useCallback } from "react"
import { useIndustryIntelStore } from "@/stores/industry-intel-store"
import type { TacticalAlert } from "@/types/industry-intel"

const THREAT_BORDER: Record<string, string> = {
  LOW: "border-emerald-500/40",
  MEDIUM: "border-amber-500/40",
  HIGH: "border-orange-500/40",
  CRITICAL: "border-red-500/40",
}

const THREAT_BG: Record<string, string> = {
  LOW: "bg-emerald-500/10",
  MEDIUM: "bg-amber-500/10",
  HIGH: "bg-orange-500/10",
  CRITICAL: "bg-red-500/10",
}

function AlertCard({
  alert,
  onAcknowledge,
}: {
  alert: TacticalAlert
  onAcknowledge: () => void
}) {
  const p = alert.payload
  const threatLevel = p.threatLevel ?? "MEDIUM"

  return (
    <div
      className={`border rounded-lg p-4 ${THREAT_BORDER[threatLevel]} ${THREAT_BG[threatLevel]}`}
      role="alert"
      aria-live="assertive"
      aria-label={`${threatLevel} 级别告警: ${p.title ?? "未知"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                threatLevel === "CRITICAL" ? "bg-red-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            <span className="text-xs font-medium text-zinc-200">{p.title ?? "战术告警"}</span>
            <span className="text-[10px] text-zinc-500 font-mono">{threatLevel}</span>
          </div>
          {p.description && (
            <p className="text-xs text-zinc-400 mb-1">{p.description}</p>
          )}
          {p.impactAnalysis && (
            <p className="text-[10px] text-zinc-600">
              影响: {p.impactAnalysis}
            </p>
          )}
        </div>
        <button
          onClick={onAcknowledge}
          className="shrink-0 px-2.5 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
          aria-label="确认此告警"
        >
          确认
        </button>
      </div>
      {alert.timestamp && (
        <p className="text-[9px] text-zinc-600 mt-2">
          {new Date(alert.timestamp).toLocaleTimeString("zh-CN")}
        </p>
      )}
    </div>
  )
}

export function ThreatAlertModal() {
  const alerts = useIndustryIntelStore((s) => s.alerts)
  const acknowledgeAlert = useIndustryIntelStore((s) => s.acknowledgeAlert)

  const unacknowledged = alerts.filter((a) => !a.acknowledged)

  // 自动消失：CRITICAL 30s，其他 10s
  useEffect(() => {
    if (unacknowledged.length === 0) return

    const timers: ReturnType<typeof setTimeout>[] = []
    for (const alert of unacknowledged) {
      const delay = alert.payload.threatLevel === "CRITICAL" ? 30_000 : 10_000
      const t = setTimeout(() => {
        acknowledgeAlert(alert.id)
      }, delay)
      timers.push(t)
    }
    return () => timers.forEach(clearTimeout)
  }, [unacknowledged, acknowledgeAlert])

  if (unacknowledged.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full"
      aria-label="战术告警通知"
    >
      {unacknowledged.slice(0, 3).map((alert) => (
        <AlertCard
          key={alert.id}
          alert={alert}
          onAcknowledge={() => acknowledgeAlert(alert.id)}
        />
      ))}
      {unacknowledged.length > 3 && (
        <p className="text-[10px] text-zinc-500 text-center">
          还有 {unacknowledged.length - 3} 条告警
        </p>
      )}
    </div>
  )
}
