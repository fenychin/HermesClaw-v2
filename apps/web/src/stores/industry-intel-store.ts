/**
 * Industry Intelligence Center — Zustand Store
 *
 * 只存：行业切换、Agent 状态、全局告警。
 * 图表瞬时数据（flow tick、signal 等）由 hooks 本地管理，
 * 不进入 store 以避免不必要的全局重渲染。
 *
 * 三域原则：不在此 store 做任何领域判断（threat level 规则等）。
 */
"use client"

import { create } from "zustand"
import type {
  IndustryOption,
  AgentHeartbeatState,
  TacticalAlert,
  SSEConnectionStatus,
  DashboardConfig,
  ConnectorHealthItem,
} from "@/types/industry-intel"

interface IndustryIntelStore {
  // ─── 行业切换 ────────────────────────────────────────────────
  activeIndustryId: string | null
  industryOptions: IndustryOption[]
  setActiveIndustry: (id: string) => void
  setIndustryOptions: (options: IndustryOption[]) => void

  // ─── Dashboard 配置 ───────────────────────────────────────────
  dashboardConfig: DashboardConfig | null
  setDashboardConfig: (config: DashboardConfig) => void

  // ─── SSE 连接状态 ─────────────────────────────────────────────
  sseStatus: SSEConnectionStatus
  setSSEStatus: (status: SSEConnectionStatus) => void

  // ─── Agent 心跳状态 ───────────────────────────────────────────
  agentHeartbeats: Record<string, AgentHeartbeatState>
  updateAgentHeartbeat: (
    agentId: string,
    partial: Partial<AgentHeartbeatState>,
  ) => void
  setAgentHeartbeats: (heartbeats: Record<string, AgentHeartbeatState>) => void

  // ─── 全局告警 ─────────────────────────────────────────────────
  alerts: TacticalAlert[]
  addAlert: (alert: TacticalAlert) => void
  acknowledgeAlert: (alertId: string) => void
  clearAlerts: () => void
  /** 最多保留 50 条 */
  MAX_ALERTS: number

  // ─── 全局威胁等级 ─────────────────────────────────────────────
  globalThreatLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  setGlobalThreatLevel: (level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") => void

  // ─── 连接器健康 ───────────────────────────────────────────────
  connectorHealth: ConnectorHealthItem[]
  setConnectorHealth: (items: ConnectorHealthItem[]) => void

  // ─── 节点→沙盘联动（Phase 4） ──────────────────────────────────
  sandboxPreFill: {
    scenario: string
    hypothesis: string
    timeHorizon: string
    sourceNodeId: string | null
  } | null
  setSandboxPreFill: (preFill: IndustryIntelStore["sandboxPreFill"]) => void
  clearSandboxPreFill: () => void
}

export const useIndustryIntelStore = create<IndustryIntelStore>((set) => ({
  activeIndustryId: null,
  industryOptions: [],
  setActiveIndustry: (id) => set({ activeIndustryId: id }),
  setIndustryOptions: (options) => set({ industryOptions: options }),

  dashboardConfig: null,
  setDashboardConfig: (config) => set({ dashboardConfig: config }),

  sseStatus: "disconnected",
  setSSEStatus: (status) => set({ sseStatus: status }),

  agentHeartbeats: {},
  updateAgentHeartbeat: (agentId, partial) =>
    set((state) => ({
      agentHeartbeats: {
        ...state.agentHeartbeats,
        [agentId]: {
          ...state.agentHeartbeats[agentId],
          ...partial,
          agentId: agentId as AgentHeartbeatState["agentId"],
        },
      },
    })),
  setAgentHeartbeats: (heartbeats) => set({ agentHeartbeats: heartbeats }),

  alerts: [],
  MAX_ALERTS: 50,
  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, state.MAX_ALERTS),
    })),
  acknowledgeAlert: (alertId) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, acknowledged: true } : a,
      ),
    })),
  clearAlerts: () => set({ alerts: [] }),

  globalThreatLevel: "LOW",
  setGlobalThreatLevel: (level) => set({ globalThreatLevel: level }),

  connectorHealth: [],
  setConnectorHealth: (items) => set({ connectorHealth: items }),

  sandboxPreFill: null,
  setSandboxPreFill: (preFill) => set({ sandboxPreFill: preFill }),
  clearSandboxPreFill: () => set({ sandboxPreFill: null }),
}))
