import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { errorResponse } from "@/lib/api-utils"
import { type WorkspaceContext } from "@/lib/workspace"
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { ApiResponse } from "@/lib/server/api-response"

/** 任务状态允许值 */
const VALID_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const
/** 任务优先级允许值 */
const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const

/**
 * PATCH /api/tasks/[id] —— 更新任务状态 / 优先级
 * —— RBAC: MEMBER+
 * —— AuditLog action: 'task.update', riskLevel: 'low'
 */
export const PATCH = withRBAC(async (
  request: Request,
  ctx: WorkspaceContext,
  routeContext: RouteContext<{ id: string }>,
) => {
  const { id } = await routeContext.params
  const rawBody = await request.json()
  const { status, priority } = rawBody as {
    status?: string
    priority?: string
  }

  // 参数校验：至少提供一个更新字段
  if (!status && !priority) {
    return errorResponse("至少提供 status 或 priority 字段", 400)
  }

  if (status && !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
    return errorResponse(`status 无效，允许值: ${VALID_STATUSES.join(", ")}`, 400)
  }

  if (priority && !VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
    return errorResponse(`priority 无效，允许值: ${VALID_PRIORITIES.join(", ")}`, 400)
  }

  const actor = await actorFromSession()

  // 先检查任务是否存在且属于当前 workspace
  const existing = await prisma.task.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
  })
  if (!existing) {
    return errorResponse("任务不存在", 404)
  }

  // 预记录审计日志
  const auditEntry = await createAuditEntry({
    actor,
    action: "task.update",
    targetType: "task",
    targetId: id,
    detail: `更新任务: ${existing.title}（status: ${existing.status} → ${status ?? existing.status}, priority: ${existing.priority} → ${priority ?? existing.priority}）`,
    riskLevel: "low",
    workspaceId: ctx.workspaceId,
    automationLevel: "L2",
    triggeredBy: "user",
    contextSnapshot: {
      previousStatus: existing.status,
      previousPriority: existing.priority,
      newStatus: status ?? null,
      newPriority: priority ?? null,
    },
  })

  // 执行更新
  try {
    const updated = await prisma.task.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
      },
    })

    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "success",
    })

    return ApiResponse.ok(updated)
  } catch (error) {
    logger.error("PATCH /api/tasks/[id]: 更新任务失败", {
      taskId: id,
      error: error instanceof Error ? error.message : "未知错误",
    })
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "failed",
      detail: `更新失败: ${error instanceof Error ? error.message : "未知错误"}`,
    })
    return ApiResponse.error("更新任务失败", 500)
  }
}, "MEMBER")

/**
 * DELETE /api/tasks/[id] —— 软删除任务（设置 status: CANCELLED）
 * —— RBAC: MEMBER+
 * —— AuditLog action: 'task.cancel'
 */
export const DELETE = withRBAC(async (
  request: Request,
  ctx: WorkspaceContext,
  routeContext: RouteContext<{ id: string }>,
) => {
  const { id } = await routeContext.params
  const actor = await actorFromSession()

  // 先检查任务是否存在且属于当前 workspace
  const existing = await prisma.task.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
  })
  if (!existing) {
    return errorResponse("任务不存在", 404)
  }

  // 已取消的任务不重复操作
  if (existing.status === "CANCELLED") {
    return errorResponse("任务已取消，无需重复操作", 409)
  }

  // 预记录审计日志
  const auditEntry = await createAuditEntry({
    actor,
    action: "task.cancel",
    targetType: "task",
    targetId: id,
    detail: `取消任务: ${existing.title}（原状态: ${existing.status}）`,
    riskLevel: "low",
    workspaceId: ctx.workspaceId,
    automationLevel: "L2",
    triggeredBy: "user",
    contextSnapshot: {
      previousStatus: existing.status,
      taskTitle: existing.title,
    },
  })

  // 执行软删除
  try {
    const cancelled = await prisma.task.update({
      where: { id },
      data: { status: "CANCELLED" },
    })

    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "success",
    })

    return ApiResponse.ok(cancelled)
  } catch (error) {
    logger.error("DELETE /api/tasks/[id]: 取消任务失败", {
      taskId: id,
      error: error instanceof Error ? error.message : "未知错误",
    })
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "failed",
      detail: `取消失败: ${error instanceof Error ? error.message : "未知错误"}`,
    })
    return ApiResponse.error("取消任务失败", 500)
  }
}, "MEMBER")
