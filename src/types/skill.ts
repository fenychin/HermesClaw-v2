/**
 * 技能（Skill）领域类型
 * —— 对应 PRD 10.6.4 技能 Skill，版本化、可绑定的能力单元
 */

export type SkillStatus = 'active' | 'inactive' | 'deprecated'
export type SkillSource = 'builtin' | 'custom' | 'industry-template'

export interface Skill {
  id: string
  name: string
  description: string
  version: string
  category: string
  source: SkillSource
  status: SkillStatus
  inputSchema: string
  outputSchema: string
  usedByAgents: string[]
  scenarios: string[]
  /** 自动化授权等级（AGENTS.md §4.7）：L1 全自动 / L2 建议执行 / L3 需确认 / L4 禁止自动 */
  automationLevel: string
  updatedAt: string
  stats?: {
    callCount: number
    successRate: number
  }
}
