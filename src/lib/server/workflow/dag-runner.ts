/**
 * DAG Runner —— 数据库装配层
 *
 * 职责：从 Prisma 加载工作流定义 → 构造运行时上下文 → 调用 dag-engine 执行
 *      → 通过钩子将执行结果写回 WorkflowRun / WorkflowNodeRun，并写 AuditLog + AgentLog。
 *
 * 治理红线（AGENTS.md）：
 *   - 每个节点 start / finish 至少写入一条 AuditLog + 一条 AgentLog（「无日志禁止静默执行」）
 *   - 节点失败时自动触发 Harness 降级（runHarnessEvaluation）
 *   - 状态扭转使用 Prisma 事务保证原子性
 *   - Skill 节点（kind='skill'）通过 selectModel() 策略路由调用 LLM，L3 强制人工确认
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { prisma } from '@/lib/prisma'
import { parseJsonField, stringifyJsonField } from '@/lib/api-utils'
import { logger } from '@/lib/logger'
import { writeAuditLog, createAuditEntry, updateAuditEntry, actorFromSession, type AuditRiskLevel } from '@/lib/server/audit'
import { writeAgentLog } from '@/lib/server/agent-log'
import { runDag } from '@/lib/server/workflow/dag-engine'
import { runHarnessEvaluation } from '@/lib/server/harness-eval'
import { guardOutput } from '@/lib/server/output-guard'
import { selectModel } from '@/lib/server/model-router'
import { callDeepSeekJson, callAnthropicText } from '@/lib/server/llm-provider'
import { loadAgentsMd } from '@/lib/server/agents-md'
import { emitOpenClawEvent } from '@/lib/server/adapters/openclaw/event-emitter'
import {
  resolveAutomationLevel,
  mapAutomationToLogRisk,
  mapAutomationToRouteRisk,
} from '@/types'
import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowDefinition,
  WorkflowRunContext,
  NodeExecutionResult,
  NodeHandler,
  RunStatus,
  RunTrigger,
} from './dag-types'

// ---- 错误类型 ----

/** 工作流不存在 */
export class WorkflowNotFoundError extends Error {
  constructor(workflowId: string) {
    super(`工作流不存在：${workflowId}`)
    this.name = 'WorkflowNotFoundError'
  }
}

/** 子流程嵌套深度超上限 */
export class MaxDepthExceededError extends Error {
  constructor(depth: number, maxDepth: number) {
    super(`子流程嵌套深度 ${depth} 超过上限 ${maxDepth}`)
    this.name = 'MaxDepthExceededError'
  }
}

// ---- 运行选项 ----

interface RunWorkflowOptions {
  /** 父运行 id（子工作流场景） */
  parentRunId?: string
  /** 当前嵌套深度 */
  depth?: number
  /** 最大嵌套深度，默认 5 */
  maxDepth?: number
  /** 触发方式 */
  trigger?: RunTrigger
  /** 自定义节点 handler（会合并到子流程调用） */
  handlers?: Record<string, NodeHandler>
}

/** runWorkflow 返回体 */
interface RunWorkflowResult {
  runId: string
  status: RunStatus
  output: unknown
}

// ---- Skill 节点执行器 ----

// 置信度阈值（AGENTS.md §4.5）：低于此值须标记高风险并请求人工确认
const CONFIDENCE_THRESHOLD = 0.7

// SKILL.md 缺失时的通用约束声明（确保 LLM 即使无完整 SKILL.md 也不会越权）
const FALLBACK_SKILL_CONSTRAINTS = [
  '不得删除任何持久化数据',
  '不得修改系统配置或其他 Agent 的任务边界',
  '不得发送外部邮件或执行资金操作',
  '输出必须标注置信度，低置信度（< 0.7）时须明确警示',
].join('；')

/**
 * 技能节点执行器（skill NodeHandler）
 *
 * 执行流程：
 *   1. 从节点 config.skillId 加载数据库 Skill 记录（含 workspaceId 隔离）
 *   2. 校验 automationLevel：L3 须有已审批 HarnessProposal，L4 绝对拒绝
 *   3. 读取 .claude/skills/<skill.name>/SKILL.md 获取技能指令
 *   4. 加载 AGENTS.md 治理规则，注入 system prompt
 *   5. 通过 selectModel() 策略路由选择 LLM Provider 与模型
 *   6. 调用 LLM 执行技能任务
 *   7. 校验 confidence 阈值（§4.5），不通过时升格 riskLevel 并标记待人工确认
 *   8. 输出经 guardOutput() 校验后返回（钩子层二次校验）
 *
 * 合规要点：
 *   - AgentLog / AuditLog 统一由 onNodeFinish 钩子写入（避免双写）
 *   - 通过 workspaceId 强制数据隔离（§4.11）
 *   - 复用 @/types 的共享映射函数（避免与 guardrail 分叉）
 */
async function executeSkillNode(
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
        `[dag-runner] L3 技能 ${skill.name}（${skillId}）缺少已审批的 HarnessProposal，拒绝执行`,
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
      `[dag-runner] L3 技能 ${skill.name} 已通过 HarnessProposal ${approvedProposal.proposalId} 审批，准许执行`,
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

  // 5. 读取 SKILL.md 文件
  const skillMdPath = join(process.cwd(), '.claude', 'skills', skill.name, 'SKILL.md')
  let skillMdContent: string
  try {
    skillMdContent = await readFile(skillMdPath, 'utf8')
    logger.info(`[dag-runner] 已加载 SKILL.md：${skillMdPath}`)
  } catch {
    // SKILL.md 不存在时，用数据库元数据 + 通用约束构造最小 skill prompt
    logger.warn(
      `[dag-runner] 无法读取 SKILL.md ${skillMdPath}，使用技能描述 + 通用约束作为回退`,
    )
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
    logger.error(`[dag-runner] 技能 ${skill.name} 策略路由失败`, {
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
    `[dag-runner] 技能 ${skill.name} 路由决策：${routing.provider}/${routing.model}（${routing.reason}）`,
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
    logger.error(`[dag-runner] 技能 ${skill.name} LLM 调用失败`, {
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
      `[dag-runner] 技能 ${skill.name} 置信度 ${(confidence * 100).toFixed(0)}% < ${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%，已升格 riskLevel 为 high`,
      { skillId, confidence },
    )
  } else if (confidence === undefined) {
    warnings.push('LLM 输出未包含 confidence 字段，无法评估置信度')
    logger.warn(`[dag-runner] 技能 ${skill.name} 输出缺少 confidence 字段`, { skillId })
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
    `[dag-runner] 技能 ${skill.name} 执行完成（${duration}，风险等级：${effectiveRiskLevel}）`,
    { skillId, provider: routing.provider, model: routing.model, confidence },
  )

  // AgentLog / AuditLog 由 onNodeFinish 钩子统一写入（避免双写）
  return {
    status: 'completed',
    output,
    riskLevel: effectiveRiskLevel,
  }
}

// ---- Data-Write 节点执行器 ----

/**
 * 按点号路径从嵌套对象中取值（如 "result.grade" → obj.result.grade）
 * 返回 undefined 表示路径不可达
 */
function resolveNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Data-Write 节点执行器
 *
 * 职责：
 *   1. 从上游节点的 output 中按 sourcePath 取值
 *   2. 通过 Prisma 更新目标模型字段（仅 Inquiry 单表）
 *   3. 通过 createAuditEntry() 预记录 → 写入 → updateAuditEntry() 标记成功（L2 审计留痕）
 *   4. 将写入的值同步到 ctx.variables（供下游 condition 节点读取）
 *
 * 安全护栏（AGENTS.md §5）：
 *   - target 仅限显式白名单（Inquiry），禁止动态拼接表名
 *   - 写入值经 sourcePath 限定的路径提取，不接受任意表达式
 *   - 审计预记录模式：写前留痕、写后更新状态
 */
async function executeDataWriteNode(
  node: WorkflowNode,
  ctx: WorkflowRunContext,
): Promise<NodeExecutionResult> {
  const config = node.config ?? {}
  const target = typeof config.target === 'string' ? config.target : null
  const field = typeof config.field === 'string' ? config.field : null
  const sourceNode = typeof config.sourceNode === 'string' ? config.sourceNode : null
  const sourcePath = typeof config.sourcePath === 'string' ? config.sourcePath : null

  // 1. 校验必填配置
  if (!target || !field || !sourceNode) {
    return {
      status: 'failed',
      error: `Data-Write 节点 ${node.id} 缺少必填 config：target=${target}, field=${field}, sourceNode=${sourceNode}`,
      riskLevel: 'low',
    }
  }

  // 2. 目标模型白名单校验（禁止动态表名，AGENTS.md §5 安全护栏）
  if (target !== 'Inquiry') {
    return {
      status: 'failed',
      error: `Data-Write 目标 ${target} 不在白名单内（仅支持 Inquiry）`,
      riskLevel: 'high',
    }
  }

  // 3. 从上游节点输出中提取值
  const upstreamOutput = ctx.nodeOutputs[sourceNode]
  if (upstreamOutput === undefined || upstreamOutput === null) {
    return {
      status: 'failed',
      error: `Data-Write 上游节点 ${sourceNode} 无输出`,
      riskLevel: 'low',
    }
  }

  const value = sourcePath ? resolveNestedValue(upstreamOutput, sourcePath) : upstreamOutput
  if (value === undefined || value === null) {
    return {
      status: 'failed',
      error: `Data-Write 路径 ${sourcePath ?? '(root)'} 在节点 ${sourceNode} 输出中不可达`,
      riskLevel: 'low',
    }
  }

  // 4. 解析 Inquiry ID（从 ctx.variables 或 nodeOutputs 中获取）
  const inquiryId =
    (typeof ctx.variables.inquiryId === 'string' ? ctx.variables.inquiryId : null) ??
    (typeof ctx.nodeOutputs.inquiryId === 'string' ? ctx.nodeOutputs.inquiryId : null)

  if (!inquiryId) {
    return {
      status: 'failed',
      error: `Data-Write 无法定位 Inquiry ID（ctx.variables.inquiryId 缺失）`,
      riskLevel: 'low',
    }
  }

  // 5. 审计预记录（AGENTS.md §5 #3 禁止静默执行）
  const auditEntry = await createAuditEntry({
    actor: ctx.actor,
    action: 'workflow.data_write',
    targetType: 'inquiry',
    targetId: inquiryId,
    detail: `工作流节点「${node.name}」写入 Inquiry.${field}=${String(value).slice(0, 50)}（来自 ${sourceNode}.${sourcePath ?? '(root)'}）`,
    riskLevel: 'low',
    workspaceId: ctx.workspaceId ?? 'default',
    automationLevel: 'L2',
    triggeredBy: 'system',
    contextSnapshot: {
      nodeId: node.id,
      sourceNode,
      sourcePath,
      target,
      field,
      value: typeof value === 'string' ? value.slice(0, 200) : value,
    },
  })

  // 6. 执行 Prisma 写入（仅 Inquiry 单表）
  try {
    // 将 grade 值映射为 Inquiry.priority 字段
    if (target === 'Inquiry') {
      const gradeStr = String(value).trim().toUpperCase()
      // A → high, B → mid, C → low（与 Inquiry.priority 对齐）
      const priorityMap: Record<string, string> = { A: 'high', B: 'mid', C: 'low' }
      const priority = priorityMap[gradeStr] ?? 'mid'

      await prisma.inquiry.update({
        where: { id: inquiryId },
        data: {
          priority,
        },
      })

      logger.info(`[dag-runner] Data-Write 已更新 Inquiry ${inquiryId}.priority = ${priority}（grade=${gradeStr}）`, {
        nodeId: node.id,
        sourceNode,
        inquiryId,
      })

      // 7. 同步到 ctx.variables（供下游 condition 节点读取）
      ctx.variables['grade'] = gradeStr
      ctx.variables['priority'] = priority
    }

    // 8. 审计状态更新为成功
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: 'success',
      detail: `写入成功：Inquiry.${field}=${String(value).slice(0, 50)}`,
    })

    return {
      status: 'completed',
      output: { updated: true, target, field, value: String(value).slice(0, 200) },
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '数据库写入异常'
    logger.error(`[dag-runner] Data-Write 节点 ${node.id} 写入失败`, { error: errorMsg, inquiryId })

    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: 'failed',
      detail: `写入失败：${errorMsg}`,
    })

    return {
      status: 'failed',
      error: `Data-Write 写入 Inquiry.${field} 失败：${errorMsg}`,
      riskLevel: 'high',
    }
  }
}

// ---- 主入口 ----

/**
 * 从数据库加载工作流并执行。
 *
 * @param workflowId   Workflow.id
 * @param input        调用方传入的初始变量（可选）
 * @param options      运行选项（子流程嵌套/自定义 handler）
 * @returns            { runId, status, output }
 */
export async function runWorkflow(
  workflowId: string,
  input?: Record<string, unknown>,
  options?: RunWorkflowOptions,
): Promise<RunWorkflowResult> {
  const depth = options?.depth ?? 0
  const maxDepth = options?.maxDepth ?? 5
  const trigger = options?.trigger ?? (options?.parentRunId ? 'subworkflow' : 'manual')

  // 防无限递归（depth 从 0 起算，所以 >= maxDepth 即到达上限）
  if (depth >= maxDepth) {
    throw new MaxDepthExceededError(depth, maxDepth)
  }

  // 1. 加载工作流定义
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } })
  if (!workflow) {
    throw new WorkflowNotFoundError(workflowId)
  }

  // 校验 JSON 数据完整性（AGENTS.md §4.4：禁止盲飞执行）
  const rawNodes = workflow.nodes
  const rawEdges = workflow.edges
  const nodes: WorkflowNode[] = parseJsonField<WorkflowNode[]>(rawNodes, [])
  const edges: WorkflowEdge[] = parseJsonField<WorkflowEdge[]>(rawEdges, [])

  // 当原始数据非空但解析为空时，记录告警（静默回退 [] 掩盖数据损坏）
  if (rawNodes && rawNodes.trim().length > 0 && nodes.length === 0) {
    logger.warn('[dag-runner] Workflow.nodes JSON 解析为空，可能存在数据损坏', { workflowId })
  }
  if (rawEdges && rawEdges.trim().length > 0 && edges.length === 0) {
    logger.warn('[dag-runner] Workflow.edges JSON 解析为空，可能存在数据损坏', { workflowId })
  }

  const def: WorkflowDefinition = {
    id: workflow.id,
    name: workflow.name,
    nodes,
    edges,
  }

  // 构建 nodeId → WorkflowNode 的快速查找表（钩子中 O(1) 查名）
  const nodeMap = new Map<string, WorkflowNode>(nodes.map((n) => [n.id, n]))

  // 2. 事务：创建运行记录 + 预创建各节点运行记录
  const runId = crypto.randomUUID()
  const actor = await actorFromSession()
  const nodeRunMap = new Map<string, string>() // nodeId → WorkflowNodeRun.id

  for (const node of nodes) {
    nodeRunMap.set(node.id, crypto.randomUUID())
  }

  await prisma.$transaction(async (tx) => {
    await tx.workflowRun.create({
      data: {
        id: runId,
        workflowId: workflow.id,
        status: 'running',
        trigger,
        input: input ? stringifyJsonField(input) : '{}',
        parentRunId: options?.parentRunId ?? null,
      },
    })

    for (const node of nodes) {
      await tx.workflowNodeRun.create({
        data: {
          id: nodeRunMap.get(node.id)!,
          runId,
          nodeId: node.id,
          kind: node.kind,
          status: 'pending',
        },
      })
    }
  })

  logger.info(`[dag-runner] WorkflowRun ${runId} 已创建（${def.name}，${nodes.length} 个节点）`, {
    workflowId,
    trigger,
    depth,
  })

  // 3. 构造上下文
  const ctx: WorkflowRunContext = {
    runId,
    workflowId,
    trigger,
    variables: input ?? {},
    nodeOutputs: {},
    actor,
    depth,
    workspaceId: workflow.workspaceId ?? 'default',
  }

  // 4. 构建 handler 注册表（合并调用方自定义 handler + 内置 skill/subworkflow handler）
  const handlers: Record<string, NodeHandler> = { ...options?.handlers }

  // 内置 skill handler：从 DB 加载 Skill → 读取 SKILL.md → 调用 LLM
  // executeSkillNode 在模块顶层定义，所有工作流嵌套层级共享同一引用
  handlers['skill'] = executeSkillNode

  // 内置 data-write handler：从上游节点输出取值 → Prisma 写入目标模型
  handlers['data-write'] = executeDataWriteNode

  // 内置 task handler：通用自定义任务（委托 node.config 中的 handler 名称二次派发）
  handlers['task'] = async (node, execCtx) => {
    const cfg = node.config ?? {}
    const customHandler = typeof cfg.handler === 'string' ? cfg.handler : null
    if (customHandler && handlers[customHandler]) {
      return handlers[customHandler](node, execCtx)
    }
    return {
      status: 'completed',
      output: { message: `任务「${node.name}」已完成` },
    }
  }

  // 内置 subworkflow handler：递归调用 runWorkflow
  // 注意：此 handler 在闭包中捕获 options.handlers，所有嵌套层级共享同一份引用
  handlers['subworkflow'] = async (node, execCtx) => {
    const config = node.config ?? {}
    const childWorkflowId = typeof config.workflowId === 'string' ? config.workflowId : null
    if (!childWorkflowId) {
      return {
        status: 'failed',
        error: `子流程节点 ${node.id} 缺少 config.workflowId`,
      }
    }

    // 子流程继承当前 ctx.variables + 上游节点输出（排除内部标记键和 null/undefined 值）
    const childInput: Record<string, unknown> = { ...execCtx.variables }
    for (const [key, val] of Object.entries(execCtx.nodeOutputs)) {
      if (key.startsWith('__skipped__')) continue
      if (val === null || val === undefined) continue
      childInput[key] = val
    }

    try {
      const childResult = await runWorkflow(childWorkflowId, childInput, {
        parentRunId: runId,
        depth: depth + 1,
        maxDepth,
        trigger: 'subworkflow',
        handlers: options?.handlers,
      })
      return {
        status: 'completed',
        output: childResult.output,
      }
    } catch (error) {
      return {
        status: 'failed',
        error: `子流程 ${childWorkflowId} 执行失败：${error instanceof Error ? error.message : '未知错误'}`,
      }
    }
  }

  // 5. 定义生命周期钩子

  const onNodeStart = async (nodeId: string) => {
    const nodeRunId = nodeRunMap.get(nodeId)
    if (!nodeRunId) return

    // 事务：扭转节点状态为 running
    try {
      await prisma.$transaction(async (tx) => {
        await tx.workflowNodeRun.update({
          where: { id: nodeRunId },
          data: { status: 'running', startedAt: new Date() },
        })
      })
    } catch (error) {
      logger.warn(`[dag-runner] 节点 ${nodeId} running 状态 DB 扭转失败（将依赖 onNodeFinish 直接写终态）`, {
        error: error instanceof Error ? error.message : '未知',
      })
    }

    // 无日志禁止静默执行：AgentLog 不依赖 DB 事务成功，始终写入
    const node = nodeMap.get(nodeId)
    await writeAgentLog({
      agentId: null,
      source: 'workflow',
      taskName: `[${def.name}] ${node?.name ?? nodeId}`,
      status: 'running',
      duration: '0s',
      detail: `workflowRunId=${runId} nodeId=${nodeId} kind=${node?.kind ?? 'unknown'}`,
    })
  }

  const onNodeFinish = async (
    nodeId: string,
    runCtx: WorkflowRunContext,
    result: NodeExecutionResult,
  ) => {
    const nodeRunId = nodeRunMap.get(nodeId)
    if (!nodeRunId) return

    const node = nodeMap.get(nodeId)
    const nodeName = node?.name ?? nodeId
    const nodeKind = node?.kind ?? 'unknown'

    // 输出校验层（AGENTS.md §5 第六条：模型输出不得直接进入生产）
    const guardedOutput = result.output
    if (result.status === 'completed' && typeof result.output === 'string') {
      const guard = guardOutput(result.output)
      if (!guard.ok) {
        logger.warn(`[dag-runner] 节点 ${nodeId} 输出被校验层拦截：${guard.reason}`)
        // 不阻断执行，但写审计警示
        await writeAuditLog({
          actor: runCtx.actor,
          action: 'workflow.node.output_guarded',
          targetType: 'workflow',
          targetId: nodeId,
          detail: `节点「${nodeName}」输出被校验层拦截：${guard.reason}`,
          riskLevel: 'mid',
          workspaceId: runCtx.workspaceId ?? 'default',
        })
      }
    }

    // 事务：扭转节点终态
    try {
      await prisma.$transaction(async (tx) => {
        await tx.workflowNodeRun.update({
          where: { id: nodeRunId },
          data: {
            status: result.status,
            output: guardedOutput !== undefined ? stringifyJsonField(guardedOutput) : null,
            error: result.error ?? null,
            finishedAt: new Date(),
          },
        })
      })
    } catch (error) {
      logger.warn(`[dag-runner] 节点 ${nodeId} 终态 DB 扭转失败`, { error })
    }

    // 无日志禁止静默执行：AgentLog（Skill 节点带入 result.riskLevel）
    await writeAgentLog({
      agentId: null,
      source: 'workflow',
      taskName: `[${def.name}] ${nodeName}`,
      status: result.status === 'skipped' ? 'success' : result.status,
      duration: '0s',
      detail: result.error ?? `workflowRunId=${runId} nodeId=${nodeId} kind=${nodeKind}`,
      riskLevel: result.riskLevel,
    })

    // 审计风险等级：Skill 节点使用 result.riskLevel，否则 fallback 到传统判定
    const auditRisk: AuditRiskLevel =
      result.riskLevel === 'high' || result.riskLevel === 'medium' || result.riskLevel === 'low'
        ? (result.riskLevel as AuditRiskLevel)
        : result.riskLevel === 'mid'
          ? 'mid'
          : result.status === 'failed'
            ? 'high'
            : 'low'

    // 审计日志（AGENTS.md §4.3：关键操作须可溯源）
    if (result.status === 'failed') {
      await writeAuditLog({
        actor: runCtx.actor,
        action: 'workflow.node.fail',
        targetType: 'workflow',
        targetId: nodeId,
        detail: `工作流「${def.name}」节点「${nodeName}」执行失败：${result.error ?? '未知错误'}`,
        riskLevel: auditRisk,
        workspaceId: runCtx.workspaceId ?? 'default',
      })

      // 节点失败 → 触发 Harness 降级评估（fire-and-forget，不阻断主流程）
      logger.info(`[dag-runner] 节点 ${nodeId} 失败，已触发 Harness 降级评估`)
      try {
        runHarnessEvaluation('auto').catch((err) => {
          logger.error('[dag-runner] Harness 降级评估 Promise 失败', {
            error: err instanceof Error ? err.message : '未知',
            nodeId,
          })
        })
      } catch (err) {
        logger.error('[dag-runner] Harness 降级评估同步抛出异常', {
          error: err instanceof Error ? err.message : '未知',
          nodeId,
        })
      }
    } else {
      await writeAuditLog({
        actor: runCtx.actor,
        action: `workflow.node.${result.status}`,
        targetType: 'workflow',
        targetId: nodeId,
        detail: `工作流「${def.name}」节点「${nodeName}」${
          result.status === 'completed'
            ? '执行完成'
            : result.status === 'skipped'
              ? '已跳过'
              : '状态变更'
        }`,
        riskLevel: auditRisk,
        workspaceId: runCtx.workspaceId ?? 'default',
      })
    }
  }

  // 6. 执行 DAG
  let finalStatus: RunStatus = 'completed'
  try {
    finalStatus = await runDag(def, ctx, { handlers, maxDepth }, { onNodeStart, onNodeFinish })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知错误'
    logger.error('[dag-runner] DAG 引擎执行异常（拓扑环路/致命错误）', {
      error: errorMsg,
      workflowId,
      runId,
    })
    finalStatus = 'failed'

    // 对所有未执行节点写入 failed 审计（AGENTS.md §5 第三条：无日志禁止静默执行）
    for (const node of nodes) {
      const nodeRunId = nodeRunMap.get(node.id)
      if (!nodeRunId) continue
      try {
        await prisma.$transaction(async (tx) => {
          await tx.workflowNodeRun.update({
            where: { id: nodeRunId },
            data: {
              status: 'failed',
              error: `DAG 引擎致命错误：${errorMsg}`,
              finishedAt: new Date(),
            },
          })
        })
      } catch {
        // 状态写入失败不阻断
      }
      await writeAgentLog({
        agentId: null,
        source: 'workflow',
        taskName: `[${def.name}] ${node.name}`,
        status: 'failed',
        duration: '0s',
        detail: `DAG 引擎致命错误：${errorMsg}`,
      })
      await writeAuditLog({
        actor,
        action: 'workflow.node.fail',
        targetType: 'workflow',
        targetId: node.id,
        detail: `工作流「${def.name}」因引擎致命错误终止：${errorMsg}`,
        riskLevel: 'high',
        workspaceId: workflow.workspaceId ?? 'default',
      })
    }
  }

  // 7. 事务：收尾 WorkflowRun 终态
  const output = ctx.nodeOutputs
  try {
    await prisma.$transaction(async (tx) => {
      await tx.workflowRun.update({
        where: { id: runId },
        data: {
          status: finalStatus,
          output: finalStatus === 'failed' ? null : stringifyJsonField(output),
          error: finalStatus === 'failed' ? '工作流执行失败' : null,
          finishedAt: new Date(),
        },
      })
    })
  } catch (error) {
    // 终态写入失败：告警但依然返回内存态给调用方，避免 API 因 DB 瞬断而完全无响应
    logger.error('[dag-runner] WorkflowRun 终态 DB 写入失败（内存态已就绪）', {
      error: error instanceof Error ? error.message : '未知',
      runId,
      finalStatus,
    })
  }

  // 审计日志：汇总
  await writeAuditLog({
    actor,
    action: `workflow.${finalStatus === 'completed' ? 'complete' : 'fail'}`,
    targetType: 'workflow',
    targetId: workflowId,
    detail: `工作流「${def.name}」${
      finalStatus === 'completed' ? '执行完成' : '执行失败'
    }（runId=${runId}，共 ${nodes.length} 个节点）`,
    riskLevel: finalStatus === 'completed' ? 'low' : 'high',
    workspaceId: workflow.workspaceId ?? 'default',
  })

  logger.info(`[dag-runner] WorkflowRun ${runId} 结束，终态：${finalStatus}`, {
    workflowId,
    nodeCount: nodes.length,
  })

  // 8. 发布 workflow 完成/失败事件（供 SSE 推送前端）
  try {
    emitOpenClawEvent('workflow', {
      type: finalStatus === 'completed' ? 'workflow:completed' : 'workflow:failed',
      payload: {
        runId,
        workflowId,
        workflowName: def.name,
        status: finalStatus,
        output: finalStatus === 'completed' ? output : null,
      },
    })
  } catch {
    // fire-and-forget：事件发布失败不阻断主流程
  }

  return {
    runId,
    status: finalStatus,
    output,
  }
}
