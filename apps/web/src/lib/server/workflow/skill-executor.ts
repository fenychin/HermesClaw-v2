/**
 * Skill 节点执行器（Hermes Control Kernel 域 —— 编排 Skill 执行）
 *
 * 职责：从 DB 加载 Skill → 校验 L3/L4 自动化门禁 → 读取 SKILL.md →
 *      注入 AGENTS.md 治理规则 → 策略路由选 LLM → 调用执行 → 置信度校验。
 *
 * 归属：Hermes Control Kernel（编排层）。LLM 提供方抽象属于 OpenClaw 适配层
 *      但 Skill 的选择、审批、策略路由决策权属于 Hermes。
 *
 * 治理红线（AGENTS.md）：
 *   - L3 强制已审批 HarnessProposal 门禁
 *   - L4 绝对禁止自动执行
 *   - workspaceId 强制数据隔离
 *   - AgentLog/AuditLog 由 dag-runner 的 onNodeFinish 钩子统一写入，此处不写
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { writeAgentLog } from '@/lib/server/agent-log'
import {
  resolveAutomationLevel,
  mapAutomationToLogRisk,
} from '@/types'
import { ToolGrantMissingException, MissingIndustryIdError } from '@/lib/server/exceptions'
import type {
  WorkflowNode,
  WorkflowRunContext,
  NodeExecutionResult,
} from './dag-types'

// @deprecated 此文件依赖旧 openclawClient — 规划迁移至 @hermesclaw/openclaw-adapter
// 待迁移：将 openclawClient.executeTask(envelope) 替换为 createOpenClawAdapter(config).dispatch(envelope)
// 当前旧适配器文件仍可用，但新功能应使用 @hermesclaw/openclaw-adapter
import { openclawClient } from '@/lib/server/adapters/openclaw/client'
import type { TaskEnvelope } from '@hermesclaw/event-contracts'
import type { ActionReceipt, LlmResponse } from '@hermesclaw/event-contracts'
import crypto from 'node:crypto'

// ---- 常量 ----

/** 置信度阈值（AGENTS.md §4.5）：低于此值须标记高风险并请求人工确认 */
export const CONFIDENCE_THRESHOLD = 0.7

/** SKILL.md 缺失时的通用约束声明（确保 LLM 即使无完整 SKILL.md 也不会越权） */
export const FALLBACK_SKILL_CONSTRAINTS = [
  '不得删除任何持久化数据',
  '不得修改系统配置或其他 Agent 的任务边界',
  '不得发送外部邮件或执行资金操作',
  '输出必须标注置信度，低置信度（< 0.7）时须明确警示',
].join('；')

/**
 * 安全解析 ToolRegistry.scopes（持久化为 JSON 字符串）。
 *
 * 绝不抛异常：解析失败或结构非法时回退空数组。
 * —— 授权校验属于安全热路径，scopes 解析一旦抛错绝不能反向导致放行（fail-open），
 *    故此处吞掉解析异常并回退，真正的拦截判定由 grant 是否存在 / 双签是否齐全决定。
 */
function parseToolScopes(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

// ---- 主执行器 ----

/**
 * 技能节点执行器（skill NodeHandler）。
 *
 * 执行流程：
 *   1. 从节点 config.skillId 加载数据库 Skill 记录（含 workspaceId 隔离）
 *   2. 校验 automationLevel：L3 须有已审批 HarnessProposal，L4 绝对拒绝
 *   3. 读取 .claude/skills/<skill.name>/SKILL.md 获取技能指令
 *   4. 加载 AGENTS.md 治理规则，注入 system prompt
 *   5. 通过 selectModel() 策略路由选择 LLM Provider 与模型
 *   6. 调用 LLM 执行技能任务
 *   7. 校验 confidence 阈值（§4.5），不通过时升格 riskLevel 并标记待人工确认
 *
 * 合规要点：
 *   - AgentLog / AuditLog 统一由 dag-runner 的 onNodeFinish 钩子写入（避免双写）
 *   - 通过 workspaceId 强制数据隔离（§4.11）
 *   - 复用 @/types 的共享映射函数（避免与 guardrail 分叉）
 */
export async function executeSkillNode(
  node: WorkflowNode,
  ctx: WorkflowRunContext,
): Promise<NodeExecutionResult> {
  const config = node.config ?? {}
  const skillId = typeof config.skillId === 'string' ? config.skillId : null
  const workspaceId = ctx.workspaceId ?? 'default'

  // 1. 校验 skillId
  if (!skillId) {
    return {
      status: 'failed',
      error: `技能节点 ${node.id} 缺少 config.skillId`,
      riskLevel: 'low',
    }
  }

  // 2. 从数据库加载 Skill（带 workspaceId 数据隔离，§4.11）
  let skill: {
    id: string
    name: string
    description: string
    version: string
    category: string
    automationLevel: string
    status: string
  }
  try {
    const record = await prisma.skill.findUnique({ where: { id: skillId } })
    if (!record) {
      return {
        status: 'failed',
        error: `技能不存在：${skillId}`,
        riskLevel: 'low',
      }
    }
    // 数据隔离二次校验：Skill 必须属于当前工作空间
    if (record.workspaceId !== workspaceId) {
      return {
        status: 'failed',
        error: `技能 ${skillId} 不属于工作空间 ${workspaceId}`,
        riskLevel: 'high',
      }
    }
    skill = record

    // 校验技能状态：仅 active 状态可执行
    if (skill.status !== 'active') {
      return {
        status: 'failed',
        error: `技能「${skill.name}」状态为 ${skill.status}，不可执行`,
        riskLevel: 'low',
      }
    }
  } catch (error) {
    return {
      status: 'failed',
      error: `加载技能 ${skillId} 失败：${error instanceof Error ? error.message : '数据库异常'}`,
      riskLevel: 'low',
    }
  }

  // 3. 自动化授权等级（复用共享解析器，避免与 guardrail 分叉）
  const automationLevel = resolveAutomationLevel(skill.automationLevel, 'low')
  const riskLevel = mapAutomationToLogRisk(automationLevel)

  // 4. L3 强制人工确认门禁（AGENTS.md §4.7）
  //    必须在当前 workspace 内有已审批的 HarnessProposal
  if (automationLevel === 'L3') {
    let approvedProposal: { proposalId: string } | null = null
    try {
      approvedProposal = await prisma.harnessProposal.findFirst({
        where: {
          status: 'approved',
          workspaceId, // §4.11 数据隔离
          targetSkillId: skillId, // 提案须明确关联到当前 skill
        },
        orderBy: { updatedAt: 'desc' },
        select: { proposalId: true },
      })
    } catch {
      // DB 查询失败视为审批缺失
    }

    if (!approvedProposal) {
      logger.warn(
        `[skill-executor] L3 技能 ${skill.name}（${skillId}）缺少已审批的 HarnessProposal，拒绝执行`,
        { workspaceId },
      )
      return {
        status: 'failed',
        error:
          `L3 技能「${skill.name}」需人工确认：缺少已审批的 HarnessProposal（AGENTS.md §4.7）。` +
          `请先在审批中心提交并审批该技能的升级提案。`,
        riskLevel,
      }
    }

    logger.info(
      `[skill-executor] L3 技能 ${skill.name} 已通过 HarnessProposal ${approvedProposal.proposalId} 审批，准许执行`,
    )
  }

  // L4 绝对禁止自动执行（AGENTS.md §4.7）
  if (automationLevel === 'L4') {
    return {
      status: 'failed',
      error:
        `L4 技能「${skill.name}」禁止系统自动执行（AGENTS.md §4.7 L4_FORBIDDEN）。` +
        `须在源业务系统由人工发起。`,
      riskLevel,
    }
  }

  // 4.6 运行时 ToolGrant 授权与双审批校验（AGENTS.md §4.3 / §6.1）
  // —— 如果该 Skill 被注册于 ToolRegistry 且为受控/高危工具（medium/high），
  //    则必须校验当前 Agent 在该 Workspace 下针对该 Tool 的有效 ToolGrant。
  //
  // 安全策略：fail-closed。授权校验链路中的任何非预期异常（DB 抖动、数据损坏等）
  //          一律拒绝执行高危工具，绝不因校验系统自身故障而放行（与 L3 审批同策略）。
  try {
    const toolRegistry = await prisma.toolRegistry.findFirst({
      where: {
        workspaceId,
        name: skill.name,
        enabled: true,
      }
    })

    if (toolRegistry && (toolRegistry.riskLevel === "medium" || toolRegistry.riskLevel === "high")) {
      const now = new Date()
      const currentAgentId = (ctx.variables.agentId as string) || "default-agent"

      const grant = await prisma.toolGrant.findFirst({
        where: {
          workspaceId,
          agentId: currentAgentId,
          toolId: toolRegistry.id,
          expiresAt: { gte: now },
          revoked: false,
        }
      })

      if (!grant) {
        logger.warn(
          `[skill-executor] 高危工具 ${toolRegistry.name} 授权缺失，拦截执行 (agentId=${currentAgentId})`
        )
        throw new ToolGrantMissingException(
          currentAgentId,
          toolRegistry.id,
          parseToolScopes(toolRegistry.scopes),
          `高危工具「${toolRegistry.name}」授权缺失，需申请临时授权。`,
          toolRegistry.riskLevel
        )
      }

      // 高危（high）工具必须双审批人签字（approvedBy1 & approvedBy2 均非空，AGENTS.md §6.1）
      if (toolRegistry.riskLevel === "high") {
        if (!grant.approvedBy1 || !grant.approvedBy2) {
          logger.warn(
            `[skill-executor] 高危工具 ${toolRegistry.name} 双签不足，拦截执行 (grantId=${grant.id})`
          )
          throw new ToolGrantMissingException(
            currentAgentId,
            toolRegistry.id,
            parseToolScopes(toolRegistry.scopes),
            `特高危工具「${toolRegistry.name}」已获取临时 Token，但缺少双人审批签字（AGENTS.md §6.1），拦截执行。`,
            toolRegistry.riskLevel
          )
        }
      }

      logger.info(
        `[skill-executor] 高危工具 ${toolRegistry.name} 运行时授权校验通过 (grantId=${grant.id})`
      )
    }
  } catch (error) {
    // 预期内的授权拦截：直接上抛，由 dag-engine 转为 failed 节点并触发审计留痕
    if (error instanceof ToolGrantMissingException) {
      throw error
    }
    // 非预期异常（DB 抖动 / 数据损坏等）：fail-closed —— 拒绝执行，绝不放行高危工具
    const errMsg = error instanceof Error ? error.message : "未知异常"
    logger.error(
      `[skill-executor] 技能「${skill.name}」ToolGrant 校验过程异常，按 fail-closed 拒绝执行`,
      { skillId, error: errMsg }
    )
    return {
      status: 'failed',
      error: `技能「${skill.name}」授权校验异常，已按安全策略（fail-closed）拒绝执行：${errMsg}`,
      riskLevel: 'high',
    }
  }

  // 5. 组装 TaskEnvelope 并分发到 OpenClaw 执行面
  const startTime = Date.now()

  // industryId 从 ctx 读取（P1-5.1：由 dag-runner 一次性注入，消除 N+1），
  // 缺失时抛 MissingIndustryIdError（而非用静默默认值绕过）。
  if (!ctx.industryId) {
    throw new MissingIndustryIdError(ctx.workflowId)
  }
  const industryId = ctx.industryId

  const envelopeInput = {
    _type: `skill.${skill.name}`,
    variables: ctx.variables,
    nodeOutputs: ctx.nodeOutputs,
    config,
  }

  const currentAgentId = (ctx.variables.agentId as string) || "default-agent"

  const envelope: TaskEnvelope = {
    taskId: `t-${crypto.randomUUID()}`,
    workflowRunId: ctx.runId,
    workspaceId,
    industryId,
    agentId: currentAgentId,
    actionType: `skill.${skill.name}`,
    input: envelopeInput,
    automationLevel,
    riskLevel,
    idempotencyKey: `idem-${crypto.randomUUID()}`,
    callbackTarget: 'local-workflow-callback',
    policySnapshotVersion: skill.version,
    version: '1.0.0'
  }

  logger.info(`[skill-executor] 发送 TaskEnvelope 至 OpenClaw 执行面: taskId=${envelope.taskId}, actionType=${envelope.actionType}`)

  let receipt: ActionReceipt
  try {
    receipt = await openclawClient.executeTask(envelope)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'OpenClaw 执行异常'
    logger.error(`[skill-executor] 技能 ${skill.name} 执行失败`, {
      skillId,
      error: errorMsg
    })
    return {
      status: 'failed',
      error: `技能「${skill.name}」分发执行失败：${errorMsg}`,
      riskLevel,
    }
  }

  const duration = `${((Date.now() - startTime) / 1000).toFixed(1)}s`
  const response = (receipt.response ?? {}) as LlmResponse

  // 6. 提取 confidence 并校验置信度
  // P2-2.1：收窄为 LlmResponse 类型，消除裸 as Record<string, unknown> / as any 摸索
  let confidence = response.confidence ?? response.result?.confidence as number | undefined
  let effectiveRiskLevel = riskLevel
  const warnings: string[] = []

  if (confidence !== undefined && confidence < CONFIDENCE_THRESHOLD) {
    warnings.push(
      `置信度 ${(confidence * 100).toFixed(0)}% 低于阈值 ${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%（AGENTS.md §4.5），建议人工审核`,
    )
    effectiveRiskLevel = 'high'
    logger.warn(
      `[skill-executor] 技能 ${skill.name} 置信度 ${(confidence * 100).toFixed(0)}% < ${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%，已升格 riskLevel 为 high`,
      { skillId, confidence },
    )
  } else if (confidence === undefined) {
    warnings.push('LLM 输出未包含 confidence 字段，无法评估置信度')
    logger.warn(`[skill-executor] 技能 ${skill.name} 输出缺少 confidence 字段`, { skillId })
  }

  const meta = response._meta

  // 构建面向用户的业务语言输出（遵循 CLAUDE.md §14.2）
  // 前端 NodeResultCard 读取 output.result、output.summary、output.confidence 三个顶层字段
  // _meta 仅用于内部审计，前端不展示
  const businessResult: Record<string, unknown> = {}
  if (response.result && typeof response.result === 'object') {
    Object.assign(businessResult, response.result as Record<string, unknown>)
  }
  // 如果 LLM 没有返回结构化结果，把原始响应中可读的字段收集起来
  if (Object.keys(businessResult).length === 0) {
    for (const [key, value] of Object.entries(response)) {
      if (key !== '_meta' && key !== 'summary' && key !== 'confidence' && key !== 'warnings') {
        businessResult[key] = value
      }
    }
  }

  const output = {
    result: businessResult,
    summary: response.summary || '技能执行完成，请查看详情',
    ...(confidence !== undefined ? { confidence } : {}),
    _meta: {
      skillId,
      skillName: skill.name,
      automationLevel,
      duration,
      provider: meta?.provider || 'unknown',
      model: meta?.model || 'unknown',
      confidence,
      riskLevel: effectiveRiskLevel,
      warnings,
    }
  }

  logger.info(
    `[skill-executor] 技能 ${skill.name} 执行完成（${duration}，结果状态：${receipt.outcome}，风险等级：${effectiveRiskLevel}）`,
  )

  return {
    status: receipt.outcome === 'success' ? 'completed' : 'failed',
    output,
    error: receipt.outcome === 'failure' ? (receipt.errorCode || '执行失败') : undefined,
    riskLevel: effectiveRiskLevel,
  }
}
