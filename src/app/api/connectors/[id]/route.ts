import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  parseJsonField,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { checkConfirmQuery } from "@/lib/server/guardrail"
import { ConnectorUpdateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext } from "@/lib/workspace"

/** 序列化 Connector，将 JSON 字符串字段反序列化 */
function serializeConnector(connector: Record<string, unknown>) {
  return {
    ...connector,
    permissions: parseJsonField(connector.permissions as string, []),
    usedByAgents: parseJsonField(connector.usedByAgents as string, []),
  }
}

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

/** PATCH /api/connectors/[id] —— 更新连接状态（连接/断开） */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, ConnectorUpdateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const existing = await prisma.connector.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse("连接器不存在", 404)
    }

    const data: Record<string, unknown> = {}

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

      // 连接成功时更新 lastSync
      if (body.status === "connected") {
        data.lastSync = new Date().toISOString()
      }
    }

    if (body.name !== undefined) data.name = body.name
    if (body.description !== undefined) data.description = body.description

    const connector = await prisma.connector.update({
      where: { id },
      data,
    })

    // 审计：记录连接器授权状态变更（AGENTS.md 4.3 受控工具接入）
    if (body.status !== undefined) {
      const isConnect = body.status === "connected"
      const ctx_ = await buildWorkspaceContext(request)
      await writeAuditLog({
        actor: await actorFromSession(),
        action: isConnect ? "connector.connect" : "connector.disconnect",
        targetType: "connector",
        targetId: id,
        detail: existing.name,
        riskLevel: isConnect ? "mid" : "low",
        workspaceId: ctx_.workspaceId,
      })
    }

    return successResponse({
      connector: serializeConnector(connector as unknown as Record<string, unknown>),
    })
  } catch (error) {
    logger.error('PATCH /api/connectors/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** DELETE /api/connectors/[id] —— 删除连接器（高危，需 ?confirm=true） */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)

    const existing = await prisma.connector.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse("连接器不存在", 404)
    }

    const guard = await checkConfirmQuery(request, "删除连接器需二次确认")
    if (!guard.ok) return guard.response

    await prisma.connector.delete({ where: { id } })

    await writeAuditLog({
      actor: guard.actor,
      action: "delete.connector",
      targetType: "connector",
      targetId: id,
      detail: existing.name,
      riskLevel: "high",
      workspaceId: ctx.workspaceId,
    })

    return successResponse({ message: "连接器已删除" })
  } catch (error) {
    logger.error('DELETE /api/connectors/[id]: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}
