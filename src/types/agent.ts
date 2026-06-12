/**
 * 智能体（Agent）领域类型
 * —— 对应 PRD 10.4 智能体中心，定义数字员工的完整数据结构
 */

export type AgentStatus = 'running' | 'idle' | 'error' | 'paused'
export type AgentSource = 'builtin' | 'custom' | 'industry'
/** 自动化授权等级（AGENTS.md §4.7） */
export type AutomationLevel = 'L1' | 'L2' | 'L3' | 'L4'

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
  stats: {
    todayTasks: number
    successRate: number
    avgDuration: string
  }
  lastActive: string
  createdAt: string
}
