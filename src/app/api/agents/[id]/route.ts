import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  stringifyJsonField,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/shared/audit"
import { writeAgentLog } from "@/lib/server/shared/agent-log"
import { checkConfirmQuery, checkConfirmValue, checkAutomationGate } from "@/lib/server/hermes/guardrail"
import { AgentUpdateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"
import { serializeAgent } from "@/lib/server/shared/agent-serializer"

/** GET /api/agents/[id] —— 获取智能体详情（含运行日志，workspaceId 隔离） */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)

    const agent = await prisma.agent.findUnique({
      where: { id, workspaceId: ctx.workspaceId },
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
    requireWritable(ctx.role)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, AgentUpdateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const existing = await prisma.agent.findUnique({ where: { id, workspaceId: ctx.workspaceId } })
    if (!existing) {
      return errorResponse("智能体不存在", 404)
    }

    // 任务边界变更属高危操作（AGENTS.md §4.5 / §4.1 / §4.7）：
    // 先经自动化授权门禁（L4 硬拒绝、L3 强制确认），再经二次确认护栏
    const isBoundaryChange =
      body.canDo !== undefined || body.cannotDo !== undefined
    if (isBoundaryChange) {
      // 门禁 1：自动化授权分级（AGENTS.md §4.7 统一门禁）
      const isConfirmed = body.confirm === true
      const autoGate = await checkAutomationGate({
        automationLevel: body.automationLevel ?? existing.automationLevel,
        riskLevel: "high",
        confirmed: isConfirmed,
        actionName: "修改任务边界",
      })
      if (!autoGate.ok) return autoGate.response

      // 门禁 2：二次确认护栏（AGENTS.md §4.5 高危操作门禁）
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
    if (body.automationLevel !== undefined) data.automationLevel = body.automationLevel
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
    if (error instanceof ForbiddenError) {
      return errorResponse(error.message, 403)
    }
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
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)

    const existing = await prisma.agent.findUnique({ where: { id, workspaceId: ctx.workspaceId } })
    if (!existing) {
      return errorResponse("智能体不存在", 404)
    }

    // 高危门禁：删除持久化数据须二次确认（AGENTS.md 4.5）
    const guard = await checkConfirmQuery(request, "删除智能体需二次确认")
    if (!guard.ok) return guard.response

    // 先删除关联的运行日志，再删除智能体（workspaceId 隔离）
    await prisma.agentLog.deleteMany({ where: { agentId: id, workspaceId: ctx.workspaceId } })
    await prisma.agent.delete({ where: { id, workspaceId: ctx.workspaceId } })

    await writeAuditLog({
      actor: guard.actor,
      action: "delete.agent",
      targetType: "agent",
      targetId: id,
      detail: existing.name,
      riskLevel: "high",
      workspaceId: ctx.workspaceId,
    })

    return successResponse({ message: "智能体已删除" })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return errorResponse(error.message, 403)
    }
    logger.error('DELETE /api/agents/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}
