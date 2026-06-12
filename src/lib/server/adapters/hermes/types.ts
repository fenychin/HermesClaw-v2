/**
 * Hermes Adapter 标准接口类型定义
 *
 * 所有类型与底层 Hermes 版本解耦，作为稳定的接口契约存在。
 * 当底层 API 变更时，仅需在 client.ts 中做适配，本文件保持不变。
 */

// ─── 工作流相关 ──────────────────────────────────────────────

/** 工作流执行请求 */
export interface HermesRunWorkflowRequest {
  /** 工作流唯一标识 */
  workflowId: string
  /** 工作流输入参数 */
  inputs: Record<string, unknown>
  /** 关联项目 ID（可选） */
  projectId?: string
  /** 执行 Agent ID（可选） */
  agentId?: string
}

/** 工作流执行状态 */
export type HermesWorkflowStatus = 'queued' | 'running' | 'completed' | 'failed'

/** 工作流执行响应 */
export interface HermesRunWorkflowResponse {
  /** 执行实例 ID */
  executionId: string
  /** 当前执行状态 */
  status: HermesWorkflowStatus
  /** 工作流输出结果 */
  outputs?: Record<string, unknown>
  /** 错误信息（仅 failed 状态） */
  error?: string
  /** 执行耗时（毫秒） */
  durationMs?: number
}

// ─── 记忆层相关 ──────────────────────────────────────────────

/** 记忆层级 */
export type HermesMemoryLevel = 'short' | 'mid' | 'long'

/** 记忆写入请求 */
export interface HermesMemoryWriteRequest {
  /** 关联项目 ID（可选） */
  projectId?: string
  /** 记忆层级：短期 / 中期 / 长期 */
  level: HermesMemoryLevel
  /** 记忆键名 */
  key: string
  /** 记忆值 */
  value: unknown
  /** 过期时间（秒），仅短期/中期记忆有效 */
  ttl?: number
}

/** 记忆读取请求 */
export interface HermesMemoryReadRequest {
  /** 关联项目 ID（可选） */
  projectId?: string
  /** 记忆层级 */
  level: HermesMemoryLevel
  /** 记忆键名 */
  key: string
}

/** 记忆读取响应 */
export interface HermesMemoryReadResponse {
  /** 记忆键名 */
  key: string
  /** 记忆值（不存在时为 null） */
  value: unknown | null
  /** 记忆层级 */
  level: HermesMemoryLevel
  /** 写入时间戳（ISO 8601） */
  writtenAt?: string
  /** 剩余 TTL（秒） */
  remainingTtl?: number
}

// ─── Harness 评估相关 ─────────────────────────────────────────

/** Harness 风险等级 */
export type HermesRiskLevel = 'low' | 'mid' | 'high'

/** Harness 评估触发请求 */
export interface HermesHarnessEvaluateRequest {
  /** 目标 Agent ID */
  agentId: string
  /** 触发原因描述 */
  triggerReason: string
  /** 支持证据（日志引用列表） */
  evidenceLogs?: string[]
}

/** Harness 升级提案（对应 AGENTS.md §3.3 Evolution Proposal） */
export interface HermesHarnessProposal {
  /** 提案 ID（格式：HEP-{timestamp}） */
  proposalId: string
  /** 触发方式 */
  triggeredBy: string
  /** 问题描述 */
  problemStatement: string
  /** 变更内容 */
  proposedChange: string
  /** 风险等级 */
  riskLevel: HermesRiskLevel
  /** 是否需要人工审批（永远为 true） */
  requiresHumanApproval: true
  /** 预期影响 */
  estimatedImpact: string
  /** 创建时间（ISO 8601） */
  createdAt: string
}
