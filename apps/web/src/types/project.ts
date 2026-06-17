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

/** 项目空间详情（PRD 10.5 四子模块核心模型） */
export interface ProjectSpace {
  id: string
  name: string
  status: 'active' | 'archived'
  systemPrompt: string
  createdAt: string
}

/** 项目空间绑定的可复用技能 */
export interface ProjectSkill {
  id: string
  name: string
  description: string
}

/** 项目空间优先引用的网站连接 */
export interface ProjectConnection {
  id: string
  url: string
  title: string
  favicon?: string
}

/** 项目空间指令配置 */
export interface ProjectInstruction {
  content: string
  updatedAt: string
}

/** 项目空间参考文件 */
export interface ProjectFile {
  id: string
  name: string
  size: number
  type: string
  uploadedAt: string
}

/** 项目空间上下文聚合对象 */
export interface ProjectContext {
  instruction: ProjectInstruction
  files: ProjectFile[]
  skills: ProjectSkill[]
  connections: ProjectConnection[]
}

