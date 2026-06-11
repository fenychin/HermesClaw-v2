/**
 * Dashboard（动态大盘）领域类型
 * —— 对应 PRD 10.3，覆盖活动流、KPI 指标等统一类型
 */

import type { ImpactLevel } from "@/types/trade"

// ============================================================
// 活动流
// ============================================================

/** 活动流统一条目（服务端 & 客户端共享） */
export interface FeedItem {
  id: string
  type: "intelligence" | "agent"
  title: string
  summary: string
  timestamp: string
  meta: Record<string, unknown>
}

// ============================================================
// 严重程度映射
// ============================================================

/** 活动流展示用严重程度 */
export type ActivitySeverity = "urgent" | "important" | "normal"

/** 从 MarketIntelligence.impactLevel 推导展示严重程度 */
export function mapImpactToSeverity(impactLevel: ImpactLevel): ActivitySeverity {
  if (impactLevel === "high") return "urgent"
  if (impactLevel === "mid") return "important"
  return "normal"
}

/** 从 AgentLog.riskLevel 推导展示严重程度 */
export function mapRiskToSeverity(riskLevel: string | null | undefined): ActivitySeverity {
  if (riskLevel === "high") return "urgent"
  if (riskLevel === "medium") return "important"
  return "normal"
}
