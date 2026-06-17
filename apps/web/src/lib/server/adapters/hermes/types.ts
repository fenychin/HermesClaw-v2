/**
 * Hermes Adapter 标准接口类型定义
 *
 * 所有类型与底层 Hermes 版本解耦，作为稳定的接口契约存在。
 * 当底层 API 变更时，仅需在 client.ts 中做适配，本文件保持不变。
 *
 * P1-② 契约单源：风险等级 / 提案等基础类型从 contracts z.infer 派生，
 * 不再手写重复 interface。
 */

import type { RiskLevel, AutomationLevel } from "@hermesclaw/event-contracts"

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

/**
 * Hermes 适配层风险等级。
 *
 * 从 contracts RiskLevel 派生，排除 'critical'（Harness 不处理 catastrophic 级事件）。
 * 与 types/harness.ts 的 RiskLevel 定义一致，保证单源。
 */
export type HermesRiskLevel = Exclude<RiskLevel, 'critical'>

/** Harness 评估触发请求 */
export interface HermesHarnessEvaluateRequest {
  /** 工作空间 ID */
  workspaceId: string
  /** 目标 Agent ID */
  agentId: string
  /** 触发原因描述 */
  triggerReason: string
  /** 支持证据（日志引用列表） */
  evidenceLogs?: string[]
}

/**
 * Harness 升级提案（Hermes 适配层视图）。
 *
 * 基础字段从 contracts HarnessProposal 派生，适配层仅保留 Hermes API 交互所需的最小子集。
 * 完整提案结构见 contracts/harness-proposal.ts。
 */
export interface HermesHarnessProposal {
  /** 提案 ID（格式：HEP-{timestamp}） */
  proposalId: string
  /** 触发方式 */
  triggeredBy: string
  /** 问题描述 */
  problemStatement: string
  /** 变更内容 */
  proposedChange: string
  /** 风险等级（从 contracts RiskLevel 派生，不含 critical） */
  riskLevel: HermesRiskLevel
  /** 自动化授权等级（从 contracts AutomationLevel 派生） */
  automationLevel: AutomationLevel
  /** 是否需要人工审批（永远为 true） */
  requiresHumanApproval: true
  /** 预期影响 */
  estimatedImpact: string
  /** 创建时间（ISO 8601） */
  createdAt: string
}

// ─── Agent 会话管理（P2 新增）───────────────────────────────────

/**
 * Hermes Agent 会话标识。
 *
 * Hermes 单 agent loop 模式：一个 agent 对应一个 session，
 * session 内维护工具调用轨迹 + 三级记忆上下文。
 */
export interface HermesSessionIdentifier {
  /** 会话 ID（Hermes 侧分配，跨轮次保持） */
  sessionId: string
  /** Agent 实例 ID */
  agentId: string
  /** 所属项目 ID（可选） */
  projectId?: string
  /** 所属工作空间 ID */
  workspaceId: string
  /** 创建时间（ISO 8601） */
  createdAt: string
}

/**
 * Hermes Agent 工具调用记录。
 * 对齐 OpenClaw 的 tool.call.* 事件族，映射为 Hermes 内部 TraceEntry。
 */
export interface HermesToolCallTrace {
  /** 工具调用 ID（Hermes 侧） */
  callId: string
  /** 工具名 */
  toolName: string
  /** 调用时间（ISO 8601） */
  calledAt: string
  /** 调用参数快照 */
  input: Record<string, unknown>
  /** 返回结果快照 */
  output: unknown | null
  /** 调用状态 */
  status: "started" | "completed" | "failed"
  /** 错误信息 */
  error?: string
  /** 耗时（ms） */
  durationMs?: number
}

// ─── Prompt / Context 组装（P2 新增）─────────────────────────────

/** 通用消息格式 */
export interface HermesMessage {
  role: "user" | "assistant" | "system"
  content: string
  toolCalls?: HermesToolCallTrace[]
}

/** 内存中的记忆条目（短/中/长） */
export interface HermesMemoryEntry {
  key: string
  value: unknown
  level: HermesMemoryLevel
  writtenAt: string
  confidence: number
}

/** 工具/技能清单 */
export interface HermesToolManifest {
  name: string
  description: string
  input_schema: Record<string, unknown>
  automationLevel: AutomationLevel
}

/** 上下文策略快照（对应 harness-bundle 中的 ContextPolicy） */
export interface ContextPolicySnapshot {
  maxConversationTurns: number
  includeProjectContext: boolean
  includeOrgContext: boolean
  toolCallMaxDepth: number
}

/**
 * Prompt / Context 组装请求。
 * 控制层构造此对象，由 adapter 负责组装为 Hermes 可消费的完整 Prompt。
 */
export interface HermesPromptAssemblyRequest {
  /** 用户原始意图文本 */
  intent: string
  /** 会话历史（最近 N 轮） */
  conversationHistory?: HermesMessage[]
  /** 注入的上下文策略快照 */
  contextPolicy?: ContextPolicySnapshot
  /** 注入的三级记忆条目 */
  memoryEntries?: HermesMemoryEntry[]
  /** 可用的工具/技能清单 */
  availableTools?: HermesToolManifest[]
  /** 约束：自动化等级上限 */
  maxAutomationLevel?: AutomationLevel
}

/** 组装后的 Prompt 结构 */
export interface HermesAssembledPrompt {
  /** 系统 prompt */
  system: string
  /** 用户 prompt */
  user: string
  /** 注入的工具定义（tool_use 格式） */
  tools: HermesToolManifest[]
}

// ─── 会话创建 / 工具回调请求（P2 新增）──────────────────────────

/** 创建 Hermes Agent 会话的请求参数 */
export interface HermesCreateSessionRequest {
  agentId: string
  projectId?: string
  workspaceId: string
  contextPolicy?: ContextPolicySnapshot
}

/** 工具调用上报请求 */
export interface HermesReportToolCallsRequest {
  sessionId: string
  traces: HermesToolCallTrace[]
}

// ─── 评估报告提交（P2 新增）─────────────────────────────────────

/**
 * 提交到 Hermes 的评估报告请求体。
 * 控制层 runHarnessEvaluation() 产出的 EvaluationReport 经此接口提交。
 */
export interface HermesSubmitReportRequest {
  reportId: string
  workspaceId: string
  triggeredBy: "auto" | "manual"
  evaluatedAt: string
  metrics: {
    total: number
    errors: number
    success: number
    errorRate: number
    successRate: number
    windowHours: number
  }
  triggered: boolean
  reason?: string
  provider: string | null
  model: string | null
  proposalId?: string
  reportMd?: string
}

// ─── 健康检查（P2 新增）─────────────────────────────────────────

/** Hermes 健康检查响应 */
export interface HermesHealthCheckResponse {
  ok: boolean
  version: string
  latencyMs: number
}

// ─── Zod 契约 Schema（P1-7 contract pact 测试）─────────────────
//
// 这些 schema 与上方 interface 一一对应，是 Hermes adapter 输出契约的
// 运行时校验单源。任何 Hermes mock / 真实响应若与对应 schema 不匹配，
// 均视为契约漂移，必须先升 schema 版本再改 mock。
//
// 使用方式：
//   import { HermesRunWorkflowResponseSchema } from "./types"
//   HermesRunWorkflowResponseSchema.parse(response)

import { z } from "zod"
import { RiskLevelSchema, AutomationLevelSchema } from "@hermesclaw/event-contracts"

/** Hermes 适配层契约版本（任何字段/枚举变更必须 +1） */
export const HERMES_ADAPTER_CONTRACT_VERSION = 1

const HermesRiskLevelSchema = RiskLevelSchema
const HermesAutomationLevelSchema = AutomationLevelSchema
const HermesMemoryLevelSchema = z.enum(["short", "mid", "long"])
const HermesWorkflowStatusSchema = z.enum(["queued", "running", "completed", "failed"])

export const HermesRunWorkflowResponseSchema = z.object({
  executionId: z.string().min(1),
  status: HermesWorkflowStatusSchema,
  outputs: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
})

export const HermesHarnessProposalSchema = z.object({
  proposalId: z.string().min(1),
  triggeredBy: z.string().min(1),
  problemStatement: z.string().min(1),
  proposedChange: z.string().min(1),
  riskLevel: HermesRiskLevelSchema,
  automationLevel: HermesAutomationLevelSchema,
  requiresHumanApproval: z.literal(true),
  estimatedImpact: z.string().min(1),
  createdAt: z.string().min(1),
})

export const HermesMemoryReadResponseSchema = z.object({
  key: z.string(),
  value: z.unknown().nullable(),
  level: HermesMemoryLevelSchema,
  writtenAt: z.string().optional(),
  remainingTtl: z.number().optional(),
})

export const HermesMemoryWriteResponseSchema = z.object({
  success: z.boolean(),
})

export const HermesSessionIdentifierSchema = z.object({
  sessionId: z.string().min(1),
  agentId: z.string().min(1),
  projectId: z.string().optional(),
  workspaceId: z.string().min(1),
  createdAt: z.string().min(1),
})

export const HermesCloseSessionResponseSchema = z.object({
  archived: z.boolean(),
})

export const HermesReportToolCallsResponseSchema = z.object({
  accepted: z.boolean(),
})

export const HermesSubmitReportResponseSchema = z.object({
  reportId: z.string().min(1),
})

export const HermesHealthCheckResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string().min(1),
  latencyMs: z.number().nonnegative(),
})

/** 路径 → 响应 schema 索引（contract pact 测试用） */
export const HERMES_RESPONSE_SCHEMAS = {
  "/workflows/run": HermesRunWorkflowResponseSchema,
  "/harness/evaluate": HermesHarnessProposalSchema,
  "/memory/write": HermesMemoryWriteResponseSchema,
  "/memory/read": HermesMemoryReadResponseSchema,
  "/sessions/create": HermesSessionIdentifierSchema,
  "/sessions/close": HermesCloseSessionResponseSchema,
  "/sessions/tool-calls": HermesReportToolCallsResponseSchema,
  "/harness/report": HermesSubmitReportResponseSchema,
  "/health": HermesHealthCheckResponseSchema,
} as const
