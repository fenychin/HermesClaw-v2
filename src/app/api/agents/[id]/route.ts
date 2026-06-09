import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  parseJsonField,
  stringifyJsonField,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { writeAgentLog } from "@/lib/server/agent-log"
import { checkConfirmQuery, checkConfirmValue } from "@/lib/server/guardrail"
import { AgentUpdateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext } from "@/lib/workspace"

/** 序列化 Agent，将 JSON 字符串字段反序列化 */
function serializeAgent(agent: Record<string, unknown>) {
  return {
    ...agent,
    category: parseJsonField(agent.category as string, []),
    bindSkills: parseJsonField(agent.bindSkills as string, []),
    bindConnectors: parseJsonField(agent.bindConnectors as string, []),
    canDo: parseJsonField(agent.canDo as string, []),
    cannotDo: parseJsonField(agent.cannotDo as string, []),
    statsJson: parseJsonField(agent.statsJson as string, {}),
  }
}

/** GET /api/agents/[id] —— 获取智能体详情（含运行日志） */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        runLogs: { orderBy: { createdAt: "desc" } },
      },
    })

    if (!agent) {
      return errorResponse("智能体不存在", 404)
    }

    return successResponse({ agent: serializeAgent(agent as unknown as Record<string, unknown>) })
  } catch (error) {
    logger.error('GET /api/agents/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** PATCH /api/agents/[id] —— 更新智能体（status、name 等字段） */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, AgentUpdateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const existing = await prisma.agent.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse("智能体不存在", 404)
    }

    // 任务边界变更属高危操作（AGENTS.md 4.5 / 4.1）：须显式二次确认
    const isBoundaryChange =
      body.canDo !== undefined || body.cannotDo !== undefined
    if (isBoundaryChange) {
      const guard = await checkConfirmValue(
        body.confirm,
        "修改智能体任务边界（canDo/cannotDo）需二次确认",
      )
      if (!guard.ok) return guard.response
    }

    // 构建更新数据：仅更新传入的字段，JSON 字段需序列化
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = body.name
    if (body.role !== undefined) data.role = body.role
    if (body.description !== undefined) data.description = body.description
    if (body.status !== undefined) data.status = body.status
    if (body.source !== undefined) data.source = body.source
    if (body.category !== undefined) data.category = stringifyJsonField(body.category)
    if (body.bindSkills !== undefined) data.bindSkills = stringifyJsonField(body.bindSkills)
    if (body.bindConnectors !== undefined) data.bindConnectors = stringifyJsonField(body.bindConnectors)
    if (body.memoryPermission !== undefined) data.memoryPermission = body.memoryPermission
    if (body.harnessVersion !== undefined) data.harnessVersion = body.harnessVersion
    if (body.canDo !== undefined) data.canDo = stringifyJsonField(body.canDo)
    if (body.cannotDo !== undefined) data.cannotDo = stringifyJsonField(body.cannotDo)
    if (body.statsJson !== undefined) data.statsJson = stringifyJsonField(body.statsJson)
    if (body.lastActive !== undefined) data.lastActive = body.lastActive

    const agent = await prisma.agent.update({
      where: { id },
      data,
    })

    // 闭环反馈（AGENTS.md 4.4 / 第五章「无日志的执行属违规」）：
    // status 字段发生真实变更时，留一条运行日志，供 Harness Level 2 评估读取
    if (body.status !== undefined && body.status !== existing.status) {
      const prevStatus = existing.status
      const newStatus = body.status as string
      await writeAgentLog({
        agentId: id,
        source: "agent",
        taskName: `状态变更: ${prevStatus} → ${newStatus}`,
        status: newStatus === "error" ? "error" : "success",
        duration: "0ms",
        detail: "由用户手动触发状态变更",
      })
    }

    // 审计：边界变更单独记录为高危治理动作
    if (isBoundaryChange) {
      await writeAuditLog({
        actor: await actorFromSession(),
        action: "update.agent.boundary",
        targetType: "agent",
        targetId: id,
        detail: existing.name,
        riskLevel: "high",
        workspaceId: ctx.workspaceId,
      })
    }

    return successResponse({ agent: serializeAgent(agent as unknown as Record<string, unknown>) })
  } catch (error) {
    logger.error('PATCH /api/agents/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** DELETE /api/agents/[id] —— 删除智能体（高危，需 ?confirm=true） */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const existing = await prisma.agent.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse("智能体不存在", 404)
    }

    // 高危门禁：删除持久化数据须二次确认（AGENTS.md 4.5）
    const guard = await checkConfirmQuery(request, "删除智能体需二次确认")
    if (!guard.ok) return guard.response

    // 先删除关联的运行日志，再删除智能体
    await prisma.agentLog.deleteMany({ where: { agentId: id } })
    await prisma.agent.delete({ where: { id } })

    await writeAuditLog({
      actor: guard.actor,
      action: "delete.agent",
      targetType: "agent",
      targetId: id,
      detail: existing.name,
      riskLevel: "high",
    })

    return successResponse({ message: "智能体已删除" })
  } catch (error) {
    logger.error('DELETE /api/agents/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}
