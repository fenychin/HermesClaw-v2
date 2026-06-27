/**
 * 记忆（Memory）领域类型
 * —— 对应 PRD 10.6 智慧大脑，短/中/长期三级记忆体系
 * —— v3.43 增强：来源追踪、命中统计、知识缺口
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
  /** 来源任务 ID（Hermes Task） */
  taskId?: string
  /** 来源工作流运行 ID */
  workflowRunId?: string
  /** 关联的项目空间 ID */
  projectId?: string
  createdAt: string
  updatedAt?: string
  /** 修订历史（仅在显式 include 时返回） */
  revisions?: MemoryRevision[]
}

/** 记忆修订历史（知识变更日志 KCL 的载体） */
export interface MemoryRevision {
  id: string
  memoryId?: string
  version: number
  content: string
  summary: string
  confidence: number
  /** 操作者：用户邮箱/名，或 "system" */
  editedBy: string
  /** 变更原因（KCL） */
  reason?: string
  /** 关联的演化提案 ID */
  proposalId?: string
  createdAt: string
}

/** 记忆命中统计 */
export interface MemoryStats {
  /** 总访问次数 */
  totalAccess: number
  /** 命中次数 */
  hitCount: number
  /** 未命中次数 */
  missCount: number
  /** 命中率 (0-1) */
  hitRate: number
  /** 按记忆类型的命中分布 */
  byType?: Record<MemoryType, { hit: number; miss: number }>
}

/** 知识缺口类型 */
export type KnowledgeGapType = 'missing_sop' | 'missing_fact' | 'missing_rule' | 'stale_knowledge'

/** AI 识别出的知识缺口 */
export interface KnowledgeGap {
  id: string
  workspaceId?: string
  /** 缺口类型 */
  type: KnowledgeGapType
  /** 缺口标题 */
  title: string
  /** 缺口详细描述 */
  description: string
  /** 影响范围说明 */
  impact: string
  /** 受影响的工作流 ID 列表 */
  affectedWorkflows?: string[]
  /** 建议的知识来源 */
  suggestedSource?: string
  /** 状态：open | filling | filled | dismissed */
  status: 'open' | 'filling' | 'filled' | 'dismissed'
  /** 填补该缺口的任务 ID */
  filledByTaskId?: string
  /** 优先级：low | medium | high | critical */
  priority: 'low' | 'medium' | 'high' | 'critical'
  createdAt: string
  updatedAt?: string
}

/** 记忆访问日志条目 */
export interface MemoryAccessLog {
  id: string
  memoryId?: string
  query: string
  hit: boolean
  recalledCount: number
  sourceTaskId?: string
  sourceStep?: string
  createdAt: string
}

/** 记忆列表查询参数 */
export interface MemoryListParams {
  workspaceId?: string
  type?: MemoryType
  projectId?: string
  status?: string
  search?: string
  page?: number
  pageSize?: number
}

/** 记忆列表响应 */
export interface MemoryListResponse {
  memories: Memory[]
  total: number
  page: number
  pageSize: number
}

/** 冻结/解冻操作请求 */
export interface FreezeToggleRequest {
  frozen: boolean
  reason?: string
}
