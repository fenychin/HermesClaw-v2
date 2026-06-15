import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  stringifyJsonField,
  serializeConnector,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/shared/audit"
import { ConnectorCreateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"
import type { Connector } from "@/types"

import { getEnrichedConnectors } from "@/lib/server/shared/connectors"

/** GET /api/connectors —— 获取所有连接器列表（CDN 缓存 60s，过期后可 revalidate 30s） */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const enrichedConnectors = await getEnrichedConnectors(ctx.workspaceId)

    return Response.json(
      {
        success: true,
        data: {
          connectors: enrichedConnectors,
        },
      },
      {
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
        },
      },
    )
  } catch (error) {
    logger.error('GET /api/connectors: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** POST /api/connectors —— 创建新连接器（AGENTS.md §4.3：连接器变更须留审计） */
export async function POST(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    requireWritable(ctx.role)
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, ConnectorCreateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const connector = await prisma.connector.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId: ctx.workspaceId,
        name: body.name,
        iconEmoji: body.iconEmoji,
        description: body.description,
        status: body.status,
        category: body.category,
        lastSync: body.lastSync,
        permissions: stringifyJsonField(body.permissions),
        usedByAgents: stringifyJsonField(body.usedByAgents),
      },
    })

    // AGENTS.md §4.3 连接器变更审计：创建新连接器须留痕
    await writeAuditLog({
      actor: await actorFromSession(),
      action: "connector.create",
      targetType: "connector",
      targetId: connector.id,
      detail: `创建连接器 ${body.name}（${body.category}）`,
      riskLevel: "medium",
      workspaceId: ctx.workspaceId,
    })

    return successResponse(
      { connector: serializeConnector(connector as unknown as Record<string, unknown>) },
      201,
    )
  } catch (error) {
    logger.error('POST /api/connectors: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}
