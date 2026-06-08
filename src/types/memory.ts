/**
 * 记忆（Memory）领域类型
 * —— 对应 PRD 10.6 智慧大脑，短/中/长期三级记忆体系
 */

export type MemoryType = 'short' | 'mid' | 'long'

export interface Memory {
  id: string
  type: MemoryType
  content: string
  summary: string
  source: string
  relatedProject?: string
  relatedAgent?: string
  confidence: number
  frozen: boolean
  tags: string[]
  /** 知识版本号（P2-⑧；mid/long 内容性变更递增） */
  version?: number
  /** active | archived */
  status?: string
  createdAt: string
}
