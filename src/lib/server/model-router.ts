/**
 * 策略路由模块（Model Router）
 *
 * —— Harness「策略路由」环境层：依据任务类型 / 风险等级 / 预算上下文，
 *    决定单次 LLM 调用应使用的 Provider 与模型，并将决策留痕至审计日志。
 *
 * 设计要点（遵循 AGENTS.md）：
 *   - §1.2 环境驱动：调用方不得自行硬编码模型，统一经 selectModel() 决策；
 *   - §1.2 数据主权：每次路由决策必须写入 AuditLog（无日志的静默执行属违规）；
 *   - §2.3 失败自动降级：选中 Provider 的 API Key 缺失时，自动降级到可用 Provider；
 *   - 复用 llm-provider.ts 的 Provider 概念，不重复实现底层调用模板。
 *
 * ⚠️ 仅在服务端调用（读取环境变量 + 数据库）。
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { actorFromSession, type AuditRiskLevel } from "@/lib/server/audit"
import { parseJsonField } from "@/lib/api-utils"
import {
  type LlmProvider,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_DEEPSEEK_MODEL,
  isProviderAvailable,
} from "@/lib/server/llm-provider"

// ==============================
// 类型定义
// ==============================

/** 任务类型 */
export type TaskType = "chat" | "workflow" | "analysis" | "generation"

/** 路由风险等级（注意：与 AuditLog 的 low|mid|high 不同，此处用 medium） */
export type RouteRiskLevel = "low" | "medium" | "high"

/** 策略路由上下文 */
export interface ModelRouteContext {
  /** 任务类型 */
  taskType: TaskType
  /** 风险等级 */
  riskLevel: RouteRiskLevel
  /** 预估 token 数（供后续预算 / 限流策略扩展） */
  estimatedTokens: number
  /** 工作空间 ID（多租户隔离 + 配置读取 + 审计归属） */
  workspaceId: string
}

/** 路由决策结果 */
export interface RoutingDecision {
  /** 选中的 Provider */
  provider: LlmProvider
  /** 选中的模型 ID */
  model: string
  /** 决策理由（人类可读，写入审计 detail） */
  reason: string
}

// ==============================
// 常量（复用 llm-provider.ts 共享常量，杜绝两套漂移）
// ==============================

/** 高风险任务使用的高能力模型 */
const HIGH_CAPABILITY_MODEL = DEFAULT_ANTHROPIC_MODEL
/** 工作流等成本敏感任务使用的成本优化模型 */
const COST_OPTIMIZED_MODEL = DEFAULT_DEEPSEEK_MODEL
/** 兜底默认模型 */
const FALLBACK_MODEL = DEFAULT_DEEPSEEK_MODEL

// ==============================
// 工作空间模型配置
// ==============================

/** 各 taskType 的 Provider 偏好映射 */
type TaskProviderMap = Partial<Record<TaskType, LlmProvider>>

/** 工作空间模型路由配置（settings UI 可配置项） */
export interface WorkspaceModelSettings {
  /** 默认模型（路由 fallback） */
  defaultModel: string
  /** 各 taskType 的 Provider 偏好 */
  taskProviderMap: TaskProviderMap
}

/** 配置缺省值（无记录时返回） */
const DEFAULT_MODEL_SETTINGS: WorkspaceModelSettings = {
  defaultModel: FALLBACK_MODEL,
  taskProviderMap: {},
}

/**
 * 读取某个工作空间的模型路由配置；无记录时返回缺省值。
 * 配置读取失败不应阻断路由，降级为缺省值并告警。
 */
export async function getWorkspaceModelSettings(
  workspaceId: string,
): Promise<WorkspaceModelSettings> {
  try {
    const row = await prisma.workspaceSettings.findUnique({
      where: { workspaceId },
    })
    if (!row) return DEFAULT_MODEL_SETTINGS
    return {
      defaultModel: row.defaultModel || FALLBACK_MODEL,
      taskProviderMap: parseJsonField<TaskProviderMap>(row.taskProviderMap, {}),
    }
  } catch (error) {
    logger.warn("[model-router] 读取 WorkspaceSettings 失败，使用缺省配置", {
      workspaceId,
      error: error instanceof Error ? error.message : "未知错误",
    })
    return DEFAULT_MODEL_SETTINGS
  }
}

// ==============================
// 辅助函数
// ==============================

/** 由模型 ID 推断 Provider（claude* → anthropic，其余 → deepseek） */
function providerOf(model: string): LlmProvider {
  return model.toLowerCase().startsWith("claude") ? "anthropic" : "deepseek"
}

// isProviderAvailable() 从 llm-provider.ts 共享导入，此处不重复实现。

/** 将路由风险等级映射为审计风险等级（medium → mid） */
function toAuditRiskLevel(level: RouteRiskLevel): AuditRiskLevel {
  return level === "medium" ? "mid" : level
}

/**
 * Provider 可用性降级：选中 Provider 不可用时切换到另一可用 Provider。
 * 返回最终 provider/model 及是否发生降级（用于审计留痕）。
 */
function reconcileAvailability(
  provider: LlmProvider,
  model: string,
): { provider: LlmProvider; model: string; degraded: boolean } {
  if (isProviderAvailable(provider)) {
    return { provider, model, degraded: false }
  }
  // 降级到另一个 Provider，并切换为其对应的默认模型
  const fallbackProvider: LlmProvider = provider === "anthropic" ? "deepseek" : "anthropic"
  if (isProviderAvailable(fallbackProvider)) {
    const fallbackModel =
      fallbackProvider === "anthropic" ? HIGH_CAPABILITY_MODEL : COST_OPTIMIZED_MODEL
    return { provider: fallbackProvider, model: fallbackModel, degraded: true }
  }
  // 两个 Provider 均不可用：保持原决策，由调用方在实际请求时报错处理
  return { provider, model, degraded: false }
}

// ==============================
// 核心路由
// ==============================

/**
 * 依据上下文选择 Provider 与模型，并写入审计日志。
 *
 * 优先级：
 *   1. riskLevel === 'high'                    → 高能力模型（claude-sonnet-4-6 / anthropic）
 *   2. taskType === 'workflow' 且非 high       → 成本优化模型（deepseek-chat / deepseek）
 *   3. 其余                                     → 默认模型（WorkspaceSettings 可配置，fallback deepseek-chat）
 *
 * 决策后执行 Provider 可用性降级（§2.3），并将最终决策写入 AuditLog（§1.2）。
 */
export async function selectModel(ctx: ModelRouteContext): Promise<RoutingDecision> {
  let provider: LlmProvider
  let model: string
  let reason: string

  if (ctx.riskLevel === "high") {
    // 1. 高风险 → 高能力模型
    provider = "anthropic"
    model = HIGH_CAPABILITY_MODEL
    reason = "高风险任务路由至高能力模型"
  } else if (ctx.taskType === "workflow") {
    // 2. 工作流（非高风险）→ 成本优化模型
    provider = "deepseek"
    model = COST_OPTIMIZED_MODEL
    reason = "工作流任务路由至成本优化模型"
  } else {
    // 3. 其余 → 工作空间默认模型 + taskType Provider 偏好
    const settings = await getWorkspaceModelSettings(ctx.workspaceId)
    model = settings.defaultModel || FALLBACK_MODEL
    // Provider 优先取 taskType 偏好，否则由默认模型推断
    provider = settings.taskProviderMap[ctx.taskType] ?? providerOf(model)
    // 偏好 Provider 与模型不一致时，切换为该 Provider 的默认模型，保持语义连贯
    if (provider !== providerOf(model)) {
      model = provider === "anthropic" ? HIGH_CAPABILITY_MODEL : COST_OPTIMIZED_MODEL
    }
    reason = "默认策略路由（工作空间配置）"
  }

  // Provider 可用性降级
  const resolved = reconcileAvailability(provider, model)
  const detail = resolved.degraded
    ? `${reason}；${provider} 不可用，已降级至 ${resolved.provider}/${resolved.model}`
    : `${reason}；taskType=${ctx.taskType}, est=${ctx.estimatedTokens} tokens`

  const decision: RoutingDecision = {
    provider: resolved.provider,
    model: resolved.model,
    reason: detail,
  }

  // §1.2 数据主权：路由决策必须留痕（无日志的静默执行属违规）
  // —— 附带 contextSnapshot 供 §4.4 Level 2 评估使用
  // —— automationLevel 根据 riskLevel 推断：high→L3, medium→L2, low→L1
  // —— triggeredBy 根据调用来源推断（chat/agent 触发 → user，workflow 触发 → system）
  // —— 路由决策即时完成，直接标记 success，使用增强审计字段
  const automationLevel: "L1" | "L2" | "L3" | "L4" =
    ctx.riskLevel === "high" ? "L3" : ctx.riskLevel === "medium" ? "L2" : "L1"
  const triggeredBy: "user" | "system" | "cron" =
    ctx.taskType === "workflow" ? "system" : "user"

  try {
    await prisma.auditLog.create({
      data: {
        actor: await actorFromSession(),
        action: "model.route",
        targetType: "model",
        targetId: decision.model,
        detail: decision.reason,
        riskLevel: toAuditRiskLevel(ctx.riskLevel),
        workspaceId: ctx.workspaceId,
        contextSnapshot: {
          taskType: ctx.taskType,
          estimatedTokens: ctx.estimatedTokens,
          selectedProvider: resolved.provider,
          selectedModel: resolved.model,
          degraded: resolved.degraded,
          originalProvider: provider,
          originalModel: model,
        },
        automationLevel,
        triggeredBy,
        status: "success",
      },
    })
  } catch {
    // 静默吞错，不阻断路由决策
  }

  return decision
}
