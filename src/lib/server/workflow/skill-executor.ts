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

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { prisma } from '@/lib/prisma'
import { parseJsonField } from '@/lib/api-utils'
import { logger } from '@/lib/logger'
import { selectModel } from '@/lib/server/model-router'
import { callDeepSeekJson, callAnthropicText } from '@/lib/server/llm-provider'
import { loadAgentsMd } from '@/lib/server/agents-md'
import { writeAgentLog } from '@/lib/server/agent-log'
import {
  resolveAutomationLevel,
  mapAutomationToLogRisk,
  mapAutomationToRouteRisk,
} from '@/types'
import { ToolGrantMissingException } from '@/lib/server/exceptions'
import type {
  WorkflowNode,
  WorkflowRunContext,
  NodeExecutionResult,
} from './dag-types'

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
          OR: [
            { targetComponent: skillId },
            { targetComponent: `skill:${skillId}` },
          ],
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
        const scopes = JSON.parse(toolRegistry.scopes || "[]")
        throw new ToolGrantMissingException(
          currentAgentId,
          toolRegistry.id,
          scopes,
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
          const scopes = JSON.parse(toolRegistry.scopes || "[]")
          throw new ToolGrantMissingException(
            currentAgentId,
            toolRegistry.id,
            scopes,
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
    if (error instanceof ToolGrantMissingException) {
      throw error
    }
    logger.error("[skill-executor] ToolGrant 校验过程出现异常", { error })
  }

  // 5. 读取 SKILL.md 文件
  const skillMdPath = join(process.cwd(), '.claude', 'skills', skill.name, 'SKILL.md')
  let skillMdContent: string
  try {
    skillMdContent = await readFile(skillMdPath, 'utf8')
    logger.info(`[skill-executor] 已加载 SKILL.md：${skillMdPath}`)
  } catch {
    // SKILL.md 不存在时，用数据库元数据 + 通用约束构造最小 skill prompt
    logger.warn(
      `[skill-executor] 无法读取 SKILL.md ${skillMdPath}，使用技能描述 + 通用约束作为回退`,
    )
    // P0-③ 知识缺口埋点：SKILL.md 缺失意味着知识库不完整，记录为 high risk
    void writeAgentLog({
      source: 'knowledge-gap',
      taskName: `Skill「${skill.name}」缺少 SKILL.md`,
      status: 'warning',
      duration: '0s',
      detail: `SKILL.md 文件缺失：${skillMdPath}，已使用描述+通用约束作为回退（skillId=${skillId}）`,
      riskLevel: 'high',
    })
    skillMdContent = [
      `# ${skill.name}`,
      ``,
      skill.description,
      ``,
      `版本：${skill.version}`,
      `分类：${skill.category}`,
      ``,
      `## 约束条件（cannot_do — 运行时回退通用约束）`,
      `- ${FALLBACK_SKILL_CONSTRAINTS}`,
    ].join('\n')
  }

  // 6. 加载 AGENTS.md 治理规则并拼入 system prompt
  const { governance } = await loadAgentsMd()
  const governanceBlock = governance
    ? `\n\n## 治理规则（来自 AGENTS.md，最高优先级，运行时加载）\n${governance}`
    : ''

  const systemPrompt = [
    skillMdContent,
    governanceBlock,
    ``,
    `## 执行上下文`,
    `- 你正在工作流「${ctx.workflowId}」中作为技能节点「${node.name}」执行`,
    `- 运行 ID：${ctx.runId} · 工作空间：${workspaceId}`,
    `- 自动化授权等级：${automationLevel}`,
    ``,
    `## 输出格式要求`,
    `请以 JSON 格式返回执行结果，结构如下：`,
    `{`,
    `  "result": { ... },       // 技能执行的核心产出`,
    `  "summary": "string",     // 人类可读的执行摘要（中文）`,
    `  "confidence": 0.0-1.0,   // 置信度（AGENTS.md §4.5：< 0.7 须标记待人工确认）`,
    `  "warnings": ["..."]      // 执行过程中的警示信息`,
    `}`,
  ].join('\n')

  // 7. 构造 user prompt：融入上游节点输出与工作流输入变量
  const userPrompt = [
    `请执行以下技能任务：`,
    ``,
    `## 工作流输入变量`,
    `\`\`\`json`,
    JSON.stringify(ctx.variables, null, 2),
    `\`\`\``,
    ``,
    `## 上游节点输出`,
    `\`\`\`json`,
    JSON.stringify(ctx.nodeOutputs, null, 2),
    `\`\`\``,
    ``,
    `## 节点配置`,
    `\`\`\`json`,
    JSON.stringify(config, null, 2),
    `\`\`\``,
    ``,
    `请严格按照上述 SKILL.md 的能力清单（can_do）和约束条件（cannot_do）处理以上输入，并以 JSON 格式返回结果。`,
  ].join('\n')

  // 8. 策略路由 → 选择 LLM Provider 与模型（§4.12 禁止硬编码）
  const routeRiskLevel = mapAutomationToRouteRisk(automationLevel)
  let routing: { provider: string; model: string; reason: string }
  try {
    routing = await selectModel({
      taskType: 'workflow',
      riskLevel: routeRiskLevel,
      estimatedTokens: 2000,
      workspaceId,
    })
  } catch (error) {
    logger.error(`[skill-executor] 技能 ${skill.name} 策略路由失败`, {
      skillId,
      automationLevel,
      error: error instanceof Error ? error.message : '未知错误',
    })
    return {
      status: 'failed',
      error:
        `技能「${skill.name}」策略路由失败：${error instanceof Error ? error.message : '未知错误'}` +
        `（skillId=${skillId}，automationLevel=${automationLevel}）`,
      riskLevel,
    }
  }

  logger.info(
    `[skill-executor] 技能 ${skill.name} 路由决策：${routing.provider}/${routing.model}（${routing.reason}）`,
  )

  // 9. 调用 LLM 执行技能
  const startTime = Date.now()
  let llmOutput: unknown
  try {
    if (routing.provider === 'anthropic') {
      const text = await callAnthropicText({
        systemPrompt,
        userPrompt,
        model: routing.model,
        maxTokens: 4096,
      })
      // Anthropic 返回纯文本，尝试解析为 JSON；解析失败时保留原文
      llmOutput = parseJsonField(text, text)
    } else {
      llmOutput = await callDeepSeekJson({
        systemPrompt,
        userPrompt,
        model: routing.model,
        maxTokens: 4096,
        temperature: 0.4,
      })
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'LLM 调用异常'
    logger.error(`[skill-executor] 技能 ${skill.name} LLM 调用失败`, {
      skillId,
      provider: routing.provider,
      model: routing.model,
      error: errorMsg,
    })

    return {
      status: 'failed',
      error: `技能「${skill.name}」LLM 调用失败：${errorMsg}`,
      riskLevel,
    }
  }

  const duration = `${((Date.now() - startTime) / 1000).toFixed(1)}s`

  // 10. 提取 confidence 并校验阈值（AGENTS.md §4.5：< 0.7 须标记待人工确认）
  let confidence: number | undefined
  let effectiveRiskLevel = riskLevel
  const warnings: string[] = []

  if (typeof llmOutput === 'object' && llmOutput !== null) {
    const obj = llmOutput as Record<string, unknown>
    if (typeof obj.confidence === 'number') {
      confidence = obj.confidence
    }
    // 也尝试从嵌套路径提取
    if (confidence === undefined && typeof obj.result === 'object' && obj.result !== null) {
      const inner = obj.result as Record<string, unknown>
      if (typeof inner.confidence === 'number') {
        confidence = inner.confidence
      }
    }
  }

  if (confidence !== undefined && confidence < CONFIDENCE_THRESHOLD) {
    warnings.push(
      `置信度 ${(confidence * 100).toFixed(0)}% 低于阈值 ${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%（AGENTS.md §4.5），建议人工审核`,
    )
    // 升格风险等级：低置信度输出视为高风险
    effectiveRiskLevel = 'high'
    logger.warn(
      `[skill-executor] 技能 ${skill.name} 置信度 ${(confidence * 100).toFixed(0)}% < ${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%，已升格 riskLevel 为 high`,
      { skillId, confidence },
    )
  } else if (confidence === undefined) {
    warnings.push('LLM 输出未包含 confidence 字段，无法评估置信度')
    logger.warn(`[skill-executor] 技能 ${skill.name} 输出缺少 confidence 字段`, { skillId })
  }

  // 11. 构造输出（注入警示信息）
  const output = {
    ...(typeof llmOutput === 'object' && llmOutput !== null ? llmOutput : { raw: llmOutput }),
    _meta: {
      skillId,
      skillName: skill.name,
      automationLevel,
      duration,
      provider: routing.provider,
      model: routing.model,
      confidence,
      riskLevel: effectiveRiskLevel,
      warnings,
    },
  }

  logger.info(
    `[skill-executor] 技能 ${skill.name} 执行完成（${duration}，风险等级：${effectiveRiskLevel}）`,
    { skillId, provider: routing.provider, model: routing.model, confidence },
  )

  // AgentLog / AuditLog 由 dag-runner 的 onNodeFinish 钩子统一写入（避免双写）
  return {
    status: 'completed',
    output,
    riskLevel: effectiveRiskLevel,
  }
}
