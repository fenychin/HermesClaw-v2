/**
 * POST /api/agents/[id]/execute —— 在指定智能体边界内执行一次任务
 *
 * 流程（AGENTS.md 闭环）：
 *   1. 边界强制：assertWithinBoundary 命中 cannotDo/红线 → 拒绝 + 写 error 日志 + 审计。
 *   2. 策略路由：selectModel() 决定 Provider/模型（AGENTS.md §4.12），不再硬编码。
 *   3. 调用 LLM 执行动作。
 *   4. 输出校验：guardOutput 拦截空/超长/敏感自述。
 *   5. 全程写 AgentLog（source=agent，绑定 agentId），供 Level 2 评估。
 *
 * 请求体：{ action: string }（自然语言动作描述）
 * 响应体：{ status: "ok" | "blocked", result?, violation? }
 */
import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"
import { assertWithinBoundary } from "@/lib/server/boundary"
import { guardOutput } from "@/lib/server/output-guard"
import { writeAgentLog } from "@/lib/server/agent-log"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { getGovernanceClause } from "@/lib/server/agents-md"
import { rateLimit } from "@/lib/rate-limit"
import { AgentExecuteSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"
import { selectModel } from "@/lib/server/model-router"
import { callAnthropicText, type LlmProvider } from "@/lib/server/llm-provider"

export const runtime = "nodejs"
export const maxDuration = 60
/** LLM 请求超时（毫秒） */
const LLM_TIMEOUT_MS = 45_000

/**
 * 调用 DeepSeek Chat API（纯文本模式，非 JSON 模式）
 * —— 路由层根据 selectModel() 决策分发至此。
 */
async function callDeepSeekText(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY 未配置")
  }

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature: 0.5,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
    signal,
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => "")
    throw new Error(`DeepSeek 请求失败 (${res.status})：${errBody.slice(0, 200)}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content ?? ""
  return content
}

/**
 * 按 Provider 分发 LLM 文本调用（AGENTS.md §4.12 策略路由决定 Provider/模型）
 */
async function callLlmByProvider(
  provider: LlmProvider,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  if (provider === "anthropic") {
    return callAnthropicText({
      systemPrompt,
      userPrompt,
      model,
      maxTokens: 2048,
    })
  }
  // deepseek
  return callDeepSeekText(systemPrompt, userPrompt, model, signal)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const start = Date.now()
  const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`

  try {
    // 频率限制：每个 IP 每分钟最多 10 次智能体执行
    const ip = request.headers.get("x-forwarded-for") || "unknown"
    if (!rateLimit(ip, 10, 60_000)) {
      return Response.json(
        { success: false, error: "请求过于频繁，请稍后重试" },
        { status: 429 },
      )
    }

    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, AgentExecuteSchema)
    if (parsed instanceof Response) return parsed
    const { action } = parsed

    const agent = await prisma.agent.findUnique({
      where: { id, workspaceId: ctx.workspaceId },
    })
    if (!agent) {
      return errorResponse("智能体不存在", 404)
    }

    // 1. 边界强制（运行时，含 workspaceId 隔离）
    const boundary = await assertWithinBoundary(id, action, ctx.workspaceId)
    if (!boundary.allowed) {
      await writeAgentLog({
        agentId: id,
        source: "agent",
        taskName: action.slice(0, 40),
        status: "error",
        duration: elapsed(),
        detail: `边界拦截：${boundary.violation}`,
      })
      await writeAuditLog({
        actor: await actorFromSession(),
        action: "boundary.block",
        targetType: "agent",
        targetId: id,
        detail: `拒绝越界动作：${boundary.violation}`,
        riskLevel: "high",
        workspaceId: ctx.workspaceId,
      })
      return successResponse({
        status: "blocked",
        violation: boundary.violation,
        reason: `该动作超出「${agent.name}」的任务边界，已被运行时护栏拒绝`,
      })
    }

    // 2. 策略路由决策（AGENTS.md §4.12 — 禁止硬编码模型）
    const routing = await selectModel({
      taskType: "workflow",
      riskLevel: "low",
      estimatedTokens: 2048,
      workspaceId: ctx.workspaceId,
    })

    // 策略路由审计留痕（AGENTS.md §4.12 强制要求）
    await writeAuditLog({
      actor: await actorFromSession(),
      action: "model.route",
      targetType: "model",
      targetId: routing.model,
      detail: `${routing.provider}/${routing.model} — ${routing.reason}`,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
    })

    // 3. 调用 LLM 执行（带超时保护）
    const governance = await getGovernanceClause()
    const systemPrompt = `你是数字员工「${agent.name}」（${agent.role}）。${agent.description}\n你只能在职责范围内行动，不得声称已执行发送/删除/下单/付款等需受控工具完成的动作。${governance}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

    let output: string
    try {
      output = await callLlmByProvider(
        routing.provider,
        routing.model,
        systemPrompt,
        action,
        controller.signal,
      )
    } catch (llmErr) {
      clearTimeout(timeout)
      const errMsg = llmErr instanceof Error ? llmErr.message : "LLM 调用失败"

      // 超时专属处理
      if (llmErr instanceof Error && llmErr.name === "AbortError") {
        await writeAgentLog({
          agentId: id,
          source: "agent",
          taskName: action.slice(0, 40),
          status: "timeout",
          duration: elapsed(),
          detail: `LLM 调用超时（>${LLM_TIMEOUT_MS / 1000}s）`,
        })
        return errorResponse(`LLM 调用超时（>${LLM_TIMEOUT_MS / 1000}s）`, 504)
      }

      await writeAgentLog({
        agentId: id,
        source: "agent",
        taskName: action.slice(0, 40),
        status: "error",
        duration: elapsed(),
        detail: `LLM 调用失败：${errMsg}`,
      })
      return errorResponse(`LLM 调用失败 (${routing.provider})`, 502)
    } finally {
      clearTimeout(timeout)
    }

    // 4. 输出校验层
    const guard = guardOutput(output)
    if (!guard.ok) {
      await writeAgentLog({
        agentId: id,
        source: "agent",
        taskName: action.slice(0, 40),
        status: "error",
        duration: elapsed(),
        detail: `输出校验拦截：${guard.reason}`,
      })
      return successResponse({
        status: "blocked",
        violation: guard.reason,
        reason: `模型输出未通过校验层：${guard.reason}`,
      })
    }

    // 5. 成功执行日志
    await writeAgentLog({
      agentId: id,
      source: "agent",
      taskName: action.slice(0, 40),
      status: "success",
      duration: elapsed(),
      detail: output.slice(0, 120),
    })

    return successResponse({ status: "ok", result: output })
  } catch (error) {
    logger.error(
      "POST /api/agents/[id]/execute: 失败",
      { error: error instanceof Error ? error.message : "未知错误" },
    )
    // 内层 try/catch 防止 writeAgentLog 自身失败覆盖原始错误（AGENTS.md §5 #3）
    try {
      await writeAgentLog({
        agentId: id,
        source: "agent",
        taskName: "智能体执行",
        status: "error",
        duration: elapsed(),
        detail: error instanceof Error ? error.message : "执行失败",
      })
    } catch (logErr) {
      logger.error(
        "POST /api/agents/[id]/execute: AgentLog 写入失败",
        { error: logErr instanceof Error ? logErr.message : "未知错误" },
      )
    }
    return errorResponse("智能体执行失败", 500)
  }
}
