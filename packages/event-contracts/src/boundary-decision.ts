/**
 * BoundaryDecision 契约（CLAUDE.md §8 + 全局架构审查 P2-#8）
 *
 * 落地 boundary.ts LLM 二级判定升级为默认主路径。
 *
 * 决策来源四态：
 *   - keyword    : 命中关键词清单（短路加速器），直接 fail-closed
 *   - hard-redline : 命中 HARD_REDLINES 兜底红线，直接 fail-closed
 *   - llm        : LLM 语义判定结果（主路径）
 *   - llm-fail-closed : LLM 调用失败/超时 → 拒绝执行（安全优先）
 *
 * 所有 BoundaryDecision 必须写入 AuditLog（action: boundary.check）。
 */

import { z } from "zod"
import { VersionSchema } from "./shared"

export const BOUNDARY_DECISION_VERSION = "1.0.0"

/** 决策来源 */
export const BoundaryDecisionSourceSchema = z.enum([
  "keyword",
  "hard-redline",
  "llm",
  "llm-fail-closed",
])

/** 边界决策结果 */
export const BoundaryDecisionSchema = z.object({
  /** 是否允许执行 */
  allowed: z.boolean(),
  /** 决策来源 */
  source: BoundaryDecisionSourceSchema,
  /** 决策理由（最多 500 字） */
  reason: z.string().max(500),
  /** 命中的规则描述（keyword/hard-redline 来源时必填） */
  matchedRule: z.string().optional(),
  /** LLM Provider（llm 来源时必填） */
  llmProvider: z.string().optional(),
  /** 评估耗时（毫秒） */
  latencyMs: z.number().int().nonnegative().optional(),
  /** 契约版本 */
  version: VersionSchema,
})

/** 边界决策请求（给 LLM 的输入结构） */
export const BoundaryCheckRequestSchema = z.object({
  /** 智能体 ID */
  agentId: z.string(),
  /** 智能体名称 */
  agentName: z.string(),
  /** 请求执行的动作描述 */
  action: z.string(),
  /** 动作类型 */
  actionType: z.string(),
  /** cannotDo 清单（关键词匹配） */
  cannotDo: z.array(z.string()),
  /** 触发关键词（关键词匹配命中时提供） */
  matchedKeywords: z.array(z.string()).optional(),
  /** 是否命中 HARD_REDLINES */
  hitRedline: z.boolean().optional(),
  /** 工作空间 ID */
  workspaceId: z.string(),
})

export type BoundaryDecisionSource = z.infer<typeof BoundaryDecisionSourceSchema>
export type BoundaryDecision = z.infer<typeof BoundaryDecisionSchema>
export type BoundaryCheckRequest = z.infer<typeof BoundaryCheckRequestSchema>
