"use client"

import { memo } from "react"
import { Zap, Wifi, WifiOff, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { PanelContainer } from "./panel-container"
import { useDashboardHeartbeat } from "./use-dashboard-heartbeat"
import type { AgentDisplayState } from "./use-dashboard-heartbeat"

// ============================================================
// 状态指示器颜色映射（提取到外部确保引用稳定）
// ============================================================

const STATUS_STYLE: Record<AgentDisplayState["status"], { dot: string; label: string; text: string }> = {
  online:   { dot: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]", label: "在线", text: "text-emerald-400" },
  degraded: { dot: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]", label: "衰减", text: "text-amber-400" },
  error:    { dot: "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]", label: "异常", text: "text-red-400" },
  offline:  { dot: "bg-zinc-500", label: "离线", text: "text-zinc-500" },
}

// ============================================================
// 相对时间格式化（提取到外部确保引用稳定）
// ============================================================

function relativeTime(ts: number | null): string {
  if (ts === null) return "从未"
  const sec = Math.floor((Date.now() - ts) / 1000)
  if (sec < 5) return "刚刚"
  if (sec < 60) return `${sec}s 前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m 前`
  const hrs = Math.floor(min / 60)
  return `${hrs}h 前`
}

// ============================================================
// 单个 Agent 行（memo 隔离）
// ============================================================

const AgentRow = memo(function AgentRow({ agent }: { agent: AgentDisplayState }) {
  const style = STATUS_STYLE[agent.status]
  const isOnline = agent.status === "online"

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-accent/40 transition-colors group">
      {/* 状态点（在线时脉冲动画） */}
      <span className="relative flex size-2 shrink-0">
        {isOnline && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        )}
        <span className={cn("relative inline-flex size-2 rounded-full", style.dot)} />
      </span>

      {/* Agent 信息 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-foreground text-xs font-medium">{agent.agentId}</span>
          <span className="text-hint text-[10px] truncate">{agent.label}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-hint mt-0.5">
          <span className={cn("font-mono", style.text)}>{style.label}</span>
          <span>·</span>
          <span>{relativeTime(agent.lastHeartbeatAt)}</span>
          <span>·</span>
          <span className="bg-accent/60 px-1 py-0.5 rounded text-[9px] font-semibold">
            {agent.automationLevel}
          </span>
        </div>
      </div>

      {/* 扩展信息：hover 时展示 */}
      <span className="text-hint text-[10px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {agent.packId?.slice(0, 12)}…
      </span>
    </div>
  )
})

// ============================================================
// Panel 3 主组件：活跃智能体
// ============================================================

export function ActiveAgentsPanel() {
  const { agents, onlineCount, connected, error, reconnect } = useDashboardHeartbeat()

  // ── 状态 1：首次连接中 ──
  if (!connected && !error && agents.every((a) => a.status === "offline" && a.lastHeartbeatAt === null)) {
    return (
      <PanelContainer
        title="活跃智能体"
        icon={<Zap className="size-4" />}
      >
        <div className="flex items-center gap-2 text-hint text-xs py-4 px-2">
          <Loader2 className="size-3.5 animate-spin shrink-0" />
          <span>等待 SSE 心跳连接…</span>
        </div>
      </PanelContainer>
    )
  }

  // ── 状态 2：错误 ──
  if (error && !connected) {
    return (
      <PanelContainer
        title="活跃智能体"
        icon={<WifiOff className="size-4 text-destructive" />}
      >
        <div className="space-y-2 py-2">
          <p className="text-destructive text-xs leading-relaxed">
            连接断开：{error}
          </p>
          <button
            type="button"
            onClick={reconnect}
            className="text-brand text-[11px] hover:underline"
          >
            点击重连
          </button>
        </div>
      </PanelContainer>
    )
  }

  // ── 状态 3：已连接但全离线 ──
  if (onlineCount === 0 && connected) {
    return (
      <PanelContainer
        title="活跃智能体"
        icon={<WifiOff className="size-4 text-zinc-500" />}
      >
        <div className="space-y-2 py-2">
          <p className="text-hint text-xs">所有智能体离线</p>
          <p className="text-hint text-[10px]">
            请确认 Intel 沙盒服务 (localhost:3001) 已启动
          </p>
          <button
            type="button"
            onClick={reconnect}
            className="text-brand text-[11px] hover:underline"
          >
            尝试重连
          </button>
        </div>
      </PanelContainer>
    )
  }

  // ── 状态 4：正常展示 ──
  return (
    <PanelContainer
      title="活跃智能体"
      icon={<Wifi className="size-4 text-emerald-400" />}
      actions={
        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
          {onlineCount}/{agents.length}
        </span>
      }
    >
      <div className="space-y-0.5 -mx-1">
        {agents.map((agent) => (
          <AgentRow key={agent.agentId} agent={agent} />
        ))}
      </div>
    </PanelContainer>
  )
}
