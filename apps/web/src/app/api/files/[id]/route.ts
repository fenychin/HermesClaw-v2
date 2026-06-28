/**
 * GET /api/files/[id] — 文件详情
 * DELETE /api/files/[id] — 删除文件（需写 AuditLog + 活跃 task 检查）
 *
 * OpenClaw Runtime 职责层：文件元数据 + 执行证据关联。
 */
import { prisma } from "@/lib/prisma"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { logger } from "@/lib/logger"
import type { WorkspaceContext } from "@/lib/workspace"

export const runtime = "nodejs"

/**
 * GET — 文件详情（VIEWER 可读）
 */
export const GET = withRBAC(async (
  request: Request,
  ctx: WorkspaceContext,
  route: RouteContext<{ id: string }>,
) => {
  try {
    const { id } = await route.params
    const record = await prisma.artifact.findUnique({ where: { id } })

    if (!record || record.workspaceId !== ctx.workspaceId) {
      return errorResponse("文件不存在", 404)
    }

    return successResponse({
      id: record.id,
      name: record.fileName,
      originalName: record.originalName,
      type: record.originalName.split(".").pop()?.toLowerCase() || "",
      category: record.category,
      size: record.size,
      url: record.url,
      mimeType: record.mimeType,
      sourceType: record.sourceType as "artifact" | "user_upload",
      taskId: record.taskId,
      workflowRunId: record.workflowRunId,
      receiptHash: record.receiptHash,
      connectorId: record.connectorId,
      parseStatus: record.parseStatus as "parsed" | "parsing" | "unparsed" | "failed",
      vectorIndexStatus: (record.vectorIndexed ? "indexed" : "unindexed") as "indexed" | "unindexed",
      parseSummary: record.parseSummary,
      tags: (record.tags as string[]) || [],
      metadata: record.metadata,
      operatedBy: record.operatedBy,
      updatedAt: record.updatedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
    })
  } catch (error) {
    logger.error("GET /api/files/[id]: 查询失败", { error: error instanceof Error ? error.message : String(error) })
    return errorResponse("文件详情查询失败")
  }
}, "VIEWER")

/**
 * DELETE — 删除文件（ADMIN 权限 + 活跃 task 门禁）
 *
 * AuditLog 点：artifact.delete
 * Automation Gate：关联活跃 task 的文件禁止直接删除
 */
export const DELETE = withRBAC(async (
  request: Request,
  ctx: WorkspaceContext,
  route: RouteContext<{ id: string }>,
) => {
  const { id } = await route.params
  const actor = await actorFromSession()

  // 预记录审计
  const auditEntry = await createAuditEntry({
    actor,
    action: "artifact.delete",
    targetType: "artifact",
    targetId: id,
    riskLevel: "medium",
    workspaceId: ctx.workspaceId,
    automationLevel: "L2",
    triggeredBy: "user",
    detail: `文件删除请求`,
  })

  try {
    const record = await prisma.artifact.findUnique({ where: { id } })

    if (!record || record.workspaceId !== ctx.workspaceId) {
      await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed", detail: "文件不存在" })
      return errorResponse("文件不存在", 404)
    }

    // 自动化门禁：关联活跃 task 的文件禁止直接删除。
    // 当前 findUnique → delete 之间存在 TOCTOU 窗口：task 状态可能在查删之间变化。
    // 在单体 PostgreSQL（默认事务隔离 READ COMMITTED）下风险极低；
    // 若未来 Artifact / Task 分属不同服务，须改为 SELECT ... FOR UPDATE 或乐观锁。
    if (record.taskId) {
      const task = await prisma.task.findUnique({
        where: { id: record.taskId },
        select: { status: true },
      })
      if (task && !["completed", "failed", "cancelled"].includes(task.status)) {
        await updateAuditEntry({
          auditId: auditEntry.auditId,
          status: "failed",
          detail: `文件关联活跃任务 ${record.taskId}，禁止删除`,
        })
        return errorResponse(
          `文件关联活跃任务 (${record.taskId.slice(0, 8)}…)，请先完成任务或取消关联，或发起审批请求`,
          409,
          {
            action: "require_approval",
            taskId: record.taskId,
            workflowRunId: record.workflowRunId,
            message: "该文件正在被活跃任务使用，如需强制删除请发起审批流程",
          },
        )
      }
    }

    await prisma.artifact.delete({ where: { id } })

    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "success",
      detail: `已删除文件: ${record.fileName}`,
      contextSnapshot: {
        fileName: record.fileName,
        taskId: record.taskId,
        workflowRunId: record.workflowRunId,
        sourceType: record.sourceType,
      },
    })

    return successResponse({ deleted: true, id })
  } catch (error) {
    logger.error("DELETE /api/files/[id]: 删除失败", { error: error instanceof Error ? error.message : String(error) })
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "failed",
      detail: `删除异常: ${error instanceof Error ? error.message : "未知错误"}`,
    })
    return errorResponse("文件删除失败")
  }
}, "ADMIN")
