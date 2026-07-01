import { prisma } from '@/lib/prisma'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { logger } from '@/lib/logger'
import { selectModel } from '@/lib/server/model-router'
import { callDeepSeekJson, callAnthropicText, isProviderAvailable } from '@/lib/server/llm-provider'
import { loadAgentsMd } from '@/lib/server/agents-md'
import { parseJsonField } from '@/lib/api-utils'
import { parseJsonLoose } from '@/lib/server/harness-llm'
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

  const inputs = envelope.input as Record<string, unknown>
  const variables = inputs.variables || {}
  const nodeOutputs = inputs.nodeOutputs || {}
  const config = inputs.config || {}

  // 1. 查询数据库 Skill（多重尝试：按 ID + 按名称 + 跨 workspace 兜底）
  const skillIdFromInput = (config as any).skillId as string | undefined
  let skill: {
    id: string; name: string; description: string; version: string
    category: string; automationLevel: string; status: string
  } | null = skillIdFromInput
    ? await prisma.skill.findFirst({ where: { OR: [{ id: skillIdFromInput }, { id: { contains: skillIdFromInput } }] } })
    : null
  if (!skill) {
    skill = await prisma.skill.findFirst({
      where: { name: skillName, workspaceId }
    })
  }
  // 跨 workspace 兜底（installPack 写入 default workspace 的技能）
  if (!skill && workspaceId !== 'default') {
    skill = await prisma.skill.findFirst({
      where: { name: skillName, workspaceId: 'default' }
    })
  }
  // 最后尝试：按 name 模糊匹配，不限 workspace（开发/测试环境下的自愈）
  if (!skill) {
    skill = await prisma.skill.findFirst({
      where: { name: { contains: skillName }, workspaceId: 'default' },
      orderBy: { createdAt: 'desc' }
    })
  }
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

  // 5.1 检查大模型 API 密钥可用性（若处于开发测试环境且未配置，则优雅进行 Mock 降级）
  const isKeyAvailable = isProviderAvailable(routing.provider)

  const startTime = Date.now()
  let llmOutput: unknown

  if (!isKeyAvailable && process.env.NODE_ENV !== 'production') {
    logger.warn(`[OpenClaw Local Executor] 检测到未配置 ${routing.provider.toUpperCase()}_API_KEY，且处于开发测试模式下，正在进行 Mock 执行降级`)

    // 从工作流输入变量中提取真实数据，填充到 mock 输出
    const vars = variables as Record<string, string>
    const custName = vars.customerName || vars.companyName || vars.company || vars.name || '客户'
    const prodName = vars.productName || vars.product || vars.productDesc || '相关产品'
    const inquiryText = vars.inquiryContent || vars.content || vars.description || vars.message || ''

    // 根据技能名称返回模拟业务数据（兼容中英文技能名）
    const isAnalysis = skillName.includes('analysis') || skillName.includes('分析') || skillName.includes('评级') || skillName.includes('画像')
    const isLetter = skillName.includes('letter') || skillName.includes('开发信') || skillName.includes('起草') || skillName.includes('回复') || skillName.includes('reply')
    const isQuote = skillName.includes('quote') || skillName.includes('报价')
    const isProfile = skillName.includes('profile') || skillName.includes('画像')

    if (isAnalysis) {
      const riskLevel = inquiryText.toLowerCase().includes('urgent') ? 'medium' : 'no-risk'
      llmOutput = {
        result: {
          intent: '采购询价',
          product: prodName,
          concerns: ['价格', '交期', '质量标准'],
          risk: riskLevel,
          urgency: 'high',
          priority: 'A',
          grade: 'A',
          hasRisk: riskLevel !== 'no-risk',
          summary: `来自 ${custName} 的询盘，采购意向明确，判定为高价值客户。`,
        },
        summary: `AI 分析完成：${custName} 的${prodName}询盘采购意图明确，综合评估为 A 级意向客户，建议优先跟进。`,
        confidence: 0.92,
        warnings: ['当前处于开发环境下的 LLM Mock 降级状态，实际生产环境将调用大模型生成精准分析']
      }
    } else if (isLetter) {
      const emailBody = [
        `Subject: Re: Inquiry about ${prodName} — ${custName}`,
        '',
        `Dear ${custName},`,
        '',
        `Thank you for your inquiry regarding ${prodName}. We are pleased to introduce our product line and would be happy to provide you with a detailed quotation.`,
        '',
        `Our ${prodName} features competitive pricing, reliable quality, and timely delivery. We have been serving clients globally and are confident we can meet your requirements.`,
        '',
        `Could you please share more details about your specific needs, such as quantity, target price, and delivery timeline? This will help us prepare the most suitable offer for you.`,
        '',
        `Looking forward to your reply and the opportunity to work together.`,
        '',
        `Best regards,`,
        `Hermes Foreign Trade Team`
      ].join('\n')
      llmOutput = {
        result: {
          draft: emailBody,
          subject: `Re: Inquiry about ${prodName} — ${custName}`,
        },
        summary: `已根据${custName}的${prodName}询盘内容生成个性化英文开发信草稿，包含产品优势介绍和下一步行动引导。`,
        confidence: 0.85,
        warnings: ['当前处于开发环境下的 LLM Mock 降级状态，实际生产环境将调用大模型生成更精准的开发信']
      }
    } else if (isQuote || isProfile) {
      llmOutput = {
        result: { risk: 'no-risk', priority: 'A', hasRisk: false, grade: 'A' },
        summary: `AI ${skillName} 执行完成，已根据${custName}的${prodName}生成对应的业务方案，请在详情中查看。`,
        confidence: 0.9,
        warnings: ['当前处于开发环境下的 LLM Mock 降级状态']
      }
    } else {
      // 通用回退 — 业务语言输出，使用真实输入数据
      llmOutput = {
        result: { risk: 'no-risk', priority: 'A', hasRisk: false, grade: 'A' },
        summary: `「${skillName}」执行完成。已根据${custName !== '客户' ? custName + '的' : ''}${prodName !== '相关产品' ? prodName : '输入数据'}完成分析处理。`,
        confidence: 0.88,
        warnings: ['当前处于开发环境下的 LLM Mock 降级状态，实际生产环境将调用大模型生成真实结果']
      }
    }
  } else {
    if (routing.provider === 'anthropic') {
      const text = await callAnthropicText({
        systemPrompt,
        userPrompt,
        model: routing.model,
        maxTokens: 4096,
      })
      llmOutput = parseJsonLoose(text)
    } else {
      llmOutput = await callDeepSeekJson({
        systemPrompt,
        userPrompt,
        model: routing.model,
        maxTokens: 4096,
        temperature: 0.4,
      })
    }
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
