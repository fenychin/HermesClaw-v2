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
  updatedAt: string
}
