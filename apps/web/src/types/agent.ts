/**
 * 智能体（Agent）领域类型
 * —— 对应 PRD 10.4 智能体中心，定义数字员工的完整数据结构
 */

import type { AutomationLevel } from "@hermesclaw/event-contracts"

export type AgentStatus = 'running' | 'idle' | 'error' | 'paused'
export type AgentSource = 'builtin' | 'custom' | 'industry'
export type { AutomationLevel }

/**
 * Harness 治理状态（从最新 HarnessProposal.status 派生）。
 * "none" 表示该 Agent 尚无任何治理提案。
 */
export type HarnessStatusValue =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'canary'
  | 'active'
  | 'deprecated'
  | 'rolled_back'
  | 'none'

/** Agent 当前风险等级 */
export type AgentRiskLevel = 'low' | 'medium' | 'high'

export interface Agent {
  id: string
  name: string
  role: string
  description: string
  status: AgentStatus
  source: AgentSource
  category: string[]
  bindSkills: string[]
  bindConnectors: string[]
  memoryPermission: 'read' | 'read-write' | 'none'
  harnessVersion: string
  /** 自动化授权等级（AGENTS.md §4.7）：L1 全自动 / L2 建议执行 / L3 需确认 / L4 禁止自动 */
  automationLevel: AutomationLevel
  canDo: string[]
  cannotDo: string[]
  /** AI 生成的 Harness Spec Markdown 文档（AGENTS.md P6 Spec-First） */
  harnessSpec?: string
  industryId?: string
  templateId?: string
  stats: {
    todayTasks: number
    successRate: number
    avgDuration: string
  }
  lastActive: string
  createdAt: string

  // ======================== 治理状态字段（v3.5 新增）========================
  /** 当前治理状态：从最新 HarnessProposal.status 派生 */
  harnessStatus?: HarnessStatusValue
  /** 风险等级：从 proposal.severity 派生或 automationLevel 映射 */
  riskLevel?: AgentRiskLevel
  /** 活跃 Canary ID（如有灰度进行中） */
  activeCanaryId?: string | null
  /** 最近一次 Proposal ID（HEP-{timestamp}） */
  latestProposalId?: string | null
  /** 最近一次 Proposal 状态 */
  latestProposalStatus?: string | null
}
