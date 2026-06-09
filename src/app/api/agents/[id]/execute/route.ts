/**
 * POST /api/agents/[id]/execute —— 在指定智能体边界内执行一次任务
 *
 * 流程（AGENTS.md 闭环）：
 *   1. 边界强制：assertWithinBoundary 命中 cannotDo/红线 → 拒绝 + 写 error 日志 + 审计。
 *   2. 调用 LLM（DeepSeek，与 /api/chat 同源）执行动作。
 *   3. 输出校验：guardOutput 拦截空/超长/敏感自述。
 *   4. 全程写 AgentLog（source=agent，绑定 agentId），供 Level 2 评估。
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
import { buildWorkspaceContext } from "@/lib/workspace"

export const runtime = "nodejs"
export const maxDuration = 60

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
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, AgentExecuteSchema)
    if (parsed instanceof Response) return parsed
    const { action } = parsed

    const agent = await prisma.agent.findUnique({ where: { id } })
    if (!agent) {
      return errorResponse("智能体不存在", 404)
    }

    // 1. 边界强制（运行时）
    const boundary = await assertWithinBoundary(id, action)
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

    // 2. 调用 LLM 执行
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      await writeAgentLog({
        agentId: id,
        source: "agent",
        taskName: action.slice(0, 40),
        status: "error",
        duration: elapsed(),
        detail: "DeepSeek API Key 未配置",
      })
      return errorResponse("LLM 未配置（DEEPSEEK_API_KEY）", 500)
    }

    const governance = await getGovernanceClause()
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 2048,
        temperature: 0.5,
        messages: [
          {
            role: "system",
            content: `你是数字员工「${agent.name}」（${agent.role}）。${agent.description}\n你只能在职责范围内行动，不得声称已执行发送/删除/下单/付款等需受控工具完成的动作。${governance}`,
          },
          { role: "user", content: action },
        ],
      }),
    })

    if (!res.ok) {
      await writeAgentLog({
        agentId: id,
        source: "agent",
        taskName: action.slice(0, 40),
        status: "error",
        duration: elapsed(),
        detail: `LLM 请求失败 (${res.status})`,
      })
      return errorResponse(`LLM 请求失败 (${res.status})`, 502)
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const output = data.choices?.[0]?.message?.content ?? ""

    // 3. 输出校验层
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

    // 4. 成功执行日志
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
    logger.error('POST /api/agents/[id]/execute: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    await writeAgentLog({
      agentId: id,
      source: "agent",
      taskName: "智能体执行",
      status: "error",
      duration: elapsed(),
      detail: error instanceof Error ? error.message : "执行失败",
    })
    return errorResponse("智能体执行失败", 500)
  }
}
