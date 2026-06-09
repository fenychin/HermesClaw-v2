import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  parseJsonField,
  stringifyJsonField,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { ConnectorCreateSchema, validateBody } from "@/lib/validators"
import { buildWorkspaceContext } from "@/lib/workspace"

/** 序列化 Connector，将 JSON 字符串字段反序列化 */
function serializeConnector(connector: Record<string, unknown>) {
  return {
    ...connector,
    permissions: parseJsonField(connector.permissions as string, []),
    usedByAgents: parseJsonField(connector.usedByAgents as string, []),
  }
}

/** GET /api/connectors —— 获取所有连接器列表（CDN 缓存 60s，过期后可 revalidate 30s） */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const connectors = await prisma.connector.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
    })

    return Response.json(
      {
        success: true,
        data: {
          connectors: connectors.map((c) => serializeConnector(c as unknown as Record<string, unknown>)),
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

/** POST /api/connectors —— 创建新连接器 */
export async function POST(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
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

    return successResponse(
      { connector: serializeConnector(connector as unknown as Record<string, unknown>) },
      201,
    )
  } catch (error) {
    logger.error('POST /api/connectors: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}
