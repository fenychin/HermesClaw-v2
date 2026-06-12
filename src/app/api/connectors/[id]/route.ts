import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  serializeConnector,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { checkConfirmQuery } from "@/lib/server/guardrail"
import { ConnectorUpdateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"

/** GET /api/connectors/[id] —— 获取连接器详情 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const connector = await prisma.connector.findUnique({
      where: { id },
    })

    if (!connector) {
      return errorResponse("连接器不存在", 404)
    }

    return successResponse({
      connector: serializeConnector(connector as unknown as Record<string, unknown>),
    })
  } catch (error) {
    logger.error('GET /api/connectors/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** PATCH /api/connectors/[id] —— 更新连接状态（连接/断开）（AGENTS.md §4.3 受控工具接入） */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, ConnectorUpdateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const existing = await prisma.connector.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse("连接器不存在", 404)
    }

    const data: Record<string, unknown> = {}
    const changes: string[] = []

    // 连接/断开状态变更
    if (body.status !== undefined) {
      const validStatuses = ["connected", "available", "disconnected", "error"]
      if (!validStatuses.includes(body.status)) {
        return errorResponse(
          `无效的连接器状态: ${body.status}，有效值: ${validStatuses.join(", ")}`,
          400,
        )
      }
      data.status = body.status
      changes.push(`status: ${existing.status} → ${body.status}`)

      // 连接成功时更新 lastSync
      if (body.status === "connected") {
        data.lastSync = new Date().toISOString()
      }
    }

    if (body.name !== undefined) {
      data.name = body.name
      changes.push(`name: ${existing.name} → ${body.name}`)
    }
    if (body.description !== undefined) {
      data.description = body.description
      changes.push(`description 已更新`)
    }

    const actor = await actorFromSession()

    // AGENTS.md §5 #3 禁止静默执行：连接器变更前写入预记录审计
    const isConnect = body.status === "connected"
    const isDisconnect = body.status === "disconnected"
    const hasStatusChange = body.status !== undefined

    const entry = hasStatusChange ? await createAuditEntry({
      actor,
      action: isConnect ? "connector.connect" : isDisconnect ? "connector.disconnect" : "connector.update",
      targetType: "connector",
      targetId: id,
      detail: existing.name,
      riskLevel: isConnect ? "mid" : isDisconnect ? "low" : "mid",
      workspaceId: ctx.workspaceId,
      automationLevel: "L2",
      triggeredBy: "user",
      contextSnapshot: {
        connectorName: existing.name,
        connectorType: existing.category,
        previousStatus: existing.status,
        newStatus: body.status,
        changes,
      },
    }) : { auditId: `no-status-change-${Date.now()}`, ok: true }

    const connector = await prisma.connector.update({
      where: { id },
      data,
    })

    // 执行成功 → 更新预记录状态
    if (hasStatusChange) {
      await updateAuditEntry({
        auditId: entry.auditId,
        status: "success",
        detail: `${existing.name}：${changes.join("；")}`,
        contextSnapshot: {
          postStatus: connector.status,
          connectorType: connector.category,
          updatedAt: new Date().toISOString(),
        },
      })
    }

    // 非状态变更（仅 name/description）也留审计
    if (!hasStatusChange && (body.name !== undefined || body.description !== undefined)) {
      await createAuditEntry({
        actor,
        action: "connector.update",
        targetType: "connector",
        targetId: id,
        detail: `${existing.name}：${changes.join("；")}`,
        riskLevel: "low",
        workspaceId: ctx.workspaceId,
        automationLevel: "L2",
        triggeredBy: "user",
        contextSnapshot: {
          connectorName: existing.name,
          connectorType: existing.category,
          changes,
        },
      })
      // 直接标记 success（无异步操作）
    }

    return successResponse({
      connector: serializeConnector(connector as unknown as Record<string, unknown>),
    })
  } catch (error) {
    logger.error('PATCH /api/connectors/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** DELETE /api/connectors/[id] —— 删除连接器（高危，需 ?confirm=true）（AGENTS.md §4.3） */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)

    const existing = await prisma.connector.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse("连接器不存在", 404)
    }

    const guard = await checkConfirmQuery(request, "删除连接器需二次确认")
    if (!guard.ok) return guard.response

    // AGENTS.md §5 #3 禁止静默执行：删除前写入预记录审计
    const entry = await createAuditEntry({
      actor: guard.actor,
      action: "delete.connector",
      targetType: "connector",
      targetId: id,
      detail: existing.name,
      riskLevel: "high",
      workspaceId: ctx.workspaceId,
      automationLevel: "L3",
      triggeredBy: "user",
      contextSnapshot: {
        connectorName: existing.name,
        connectorType: existing.category,
        connectorStatus: existing.status,
        permissions: existing.permissions,
        usedByAgents: existing.usedByAgents,
      },
    })

    await prisma.connector.delete({ where: { id } })

    // 执行成功 → 更新预记录为 success
    await updateAuditEntry({
      auditId: entry.auditId,
      status: "success",
      detail: `已删除连接器 ${existing.name}（${existing.category}）`,
    })

    return successResponse({ message: "连接器已删除" })
  } catch (error) {
    logger.error('DELETE /api/connectors/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}
