/**
 * GET /api/receipts — ActionReceipt 反查 API（Phase 2 — 文件中心闭环）
 *
 * OpenClaw Runtime 职责层：按 receiptHash 反查完整 ActionReceipt，
 * 供前端文件详情"执行证据"面板展示完整回执数据。
 *
 * 查询参数：
 *   ?receiptHash=xxx  → 按 hash 查单条（供 Artifact.receiptHash 反查）
 *   ?taskId=xxx       → 按 task 查全部回执
 *   ?workflowRunId=xxx → 按 workflowRun 查全部回执
 */
import { prisma } from "@/lib/prisma"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { withRBAC } from "@/lib/server/api-handler"
import { logger } from "@/lib/logger"
import type { WorkspaceContext } from "@/lib/workspace"

export const runtime = "nodejs"

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const url = new URL(request.url)
    const receiptHash = url.searchParams.get("receiptHash")
    const taskId = url.searchParams.get("taskId")
    const workflowRunId = url.searchParams.get("workflowRunId")

    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }

    if (receiptHash) {
      where.receiptHash = receiptHash
      const record = await prisma.actionReceipt.findFirst({ where: where as any })
      if (!record) return errorResponse("回执不存在", 404)

      return successResponse({
        receiptId: record.receiptId,
        receiptHash: record.receiptHash,
        taskId: record.taskId,
        workflowRunId: record.workflowRunId,
        connectorId: record.connectorId,
        idempotencyKey: record.idempotencyKey,
        outcome: record.outcome,
        executedAt: record.executedAt.toISOString(),
        response: record.response,
        errorCode: record.errorCode,
        failureReason: record.failureReason,
        compensationStrategy: record.compensationStrategy,
        version: record.version,
        workspaceId: record.workspaceId,
        createdAt: record.createdAt.toISOString(),
      })
    }

    if (taskId) where.taskId = taskId
    if (workflowRunId) where.workflowRunId = workflowRunId

    if (!taskId && !workflowRunId) {
      return errorResponse("请提供 receiptHash、taskId 或 workflowRunId 至少一个查询参数", 400)
    }

    const records = await prisma.actionReceipt.findMany({
      where: where as any,
      orderBy: { executedAt: "desc" },
      take: 50,
    })

    return successResponse({
      receipts: records.map((r) => ({
        receiptId: r.receiptId,
        receiptHash: r.receiptHash,
        taskId: r.taskId,
        workflowRunId: r.workflowRunId,
        connectorId: r.connectorId,
        outcome: r.outcome,
        executedAt: r.executedAt.toISOString(),
        errorCode: r.errorCode,
        failureReason: r.failureReason,
        createdAt: r.createdAt.toISOString(),
      })),
      total: records.length,
    })
  } catch (error) {
    logger.error("GET /api/receipts: 查询失败", { error: error instanceof Error ? error.message : String(error) })
    return errorResponse("回执查询失败")
  }
}, "VIEWER")
