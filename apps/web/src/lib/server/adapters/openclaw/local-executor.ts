import { prisma } from '@/lib/prisma'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { logger } from '@/lib/logger'
import { selectModel } from '@/lib/server/model-router'
import { callDeepSeekJson, callAnthropicText } from '@/lib/server/llm-provider'
import { loadAgentsMd } from '@/lib/server/agents-md'
import { parseJsonField } from '@/lib/api-utils'
import { mapAutomationToRouteRisk } from '@/types'
import { writeAgentLog } from '@/lib/server/agent-log'
import type { TaskEnvelope } from '@hermesclaw/event-contracts'
import type { OpenClawTaskResult } from './types'

const FALLBACK_SKILL_CONSTRAINTS = [
  '不得删除任何持久化数据',
  '不得修改系统配置或其他 Agent 的任务边界',
  '不得发送外部邮件或执行资金操作',
  '输出必须标注置信度，低置信度（< 0.7）时须明确警示',
].join('；')

/**
 * 本地执行大模型技能任务（解耦自 OpenClawClient）
 *
 * @param envelope 任务契约对象
 */
export async function executeLocalTask(
  envelope: TaskEnvelope
): Promise<OpenClawTaskResult> {
  const skillName = envelope.actionType.replace(/^skill\./, '')
  const workspaceId = envelope.workspaceId
  const taskId = envelope.taskId
  const workflowRunId = envelope.workflowRunId

  // 1. 查询数据库 Skill
  const skill = await prisma.skill.findFirst({
    where: { name: skillName, workspaceId }
  })
  if (!skill) {
    throw new Error(`[OpenClaw Local Executor] 技能不存在或工作区不匹配: ${skillName}`)
  }

  // 2. 读取 SKILL.md
  const skillMdPath = join(process.cwd(), '.claude', 'skills', skill.name, 'SKILL.md')
  let skillMdContent: string
  try {
    skillMdContent = await readFile(skillMdPath, 'utf8')
  } catch {
    // 知识缺口警告
    void writeAgentLog({
      source: 'knowledge-gap',
      taskName: `Skill「${skill.name}」缺少 SKILL.md`,
      status: 'warning',
      duration: '0s',
      detail: `SKILL.md 文件缺失：${skillMdPath}，已使用描述+通用约束作为回退`,
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

  // 3. 加载治理规则
  const { governance } = await loadAgentsMd()
  const governanceBlock = governance
    ? `\n\n## 治理规则（来自 AGENTS.md，最高优先级，运行时加载）\n${governance}`
    : ''

  const automationLevel = envelope.automationLevel

  const systemPrompt = [
    skillMdContent,
    governanceBlock,
    ``,
    `## 执行上下文`,
    `- 你正在工作流中作为技能节点「${envelope.actionType}」执行`,
    `- 运行 ID：${workflowRunId} · 工作空间：${workspaceId}`,
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

  const inputs = envelope.input as Record<string, unknown>
  const variables = inputs.variables || {}
  const nodeOutputs = inputs.nodeOutputs || {}
  const config = inputs.config || {}

  const userPrompt = [
    `请执行以下技能任务：`,
    ``,
    `## 工作流输入变量`,
    `\`\`\`json`,
    JSON.stringify(variables, null, 2),
    `\`\`\``,
    ``,
    `## 上游节点输出`,
    `\`\`\`json`,
    JSON.stringify(nodeOutputs, null, 2),
    `\`\`\``,
    ``,
    `## 节点配置`,
    `\`\`\`json`,
    JSON.stringify(config, null, 2),
    `\`\`\``,
    ``,
    `请严格按照上述 SKILL.md 的能力清单（can_do）和约束条件（cannot_do）处理以上输入，并以 JSON 格式返回结果。`,
  ].join('\n')

  // 5. 策略路由
  const routeRiskLevel = mapAutomationToRouteRisk(automationLevel)
  const routing = await selectModel({
    taskType: 'workflow',
    riskLevel: routeRiskLevel,
    estimatedTokens: 2000,
    workspaceId,
  })

  logger.info(`[OpenClaw Local Executor] 路由决策：${routing.provider}/${routing.model}（${routing.reason}）`)

  // 6. 调用 LLM
  const startTime = Date.now()
  let llmOutput: unknown
  if (routing.provider === 'anthropic') {
    const text = await callAnthropicText({
      systemPrompt,
      userPrompt,
      model: routing.model,
      maxTokens: 4096,
    })
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

  const durationMs = Date.now() - startTime

  return {
    taskId,
    status: 'succeeded',
    outputs: typeof llmOutput === 'object' && llmOutput !== null
      ? (llmOutput as Record<string, unknown>)
      : { raw: llmOutput },
    durationMs,
    completedAt: new Date().toISOString(),
  }
}
