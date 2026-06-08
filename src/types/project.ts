/**
 * 项目空间（Project）领域类型
 * —— 对应 PRD 10.5 项目空间，按客户/订单/展会/产品线管理
 */

export type ProjectType = 'customer' | 'order' | 'exhibition' | 'product-line'
export type ProjectStatus = 'active' | 'paused' | 'completed' | 'at-risk'

export interface Project {
  id: string
  name: string
  type: ProjectType
  status: ProjectStatus
  owner: string
  relatedClient?: string
  country?: string
  productLine?: string
  activeAgents: string[]
  riskPoints: string[]
  nextActions: string[]
  createdAt: string
  updatedAt: string
  tags: string[]
}
