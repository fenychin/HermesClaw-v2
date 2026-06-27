import { prisma } from "@/lib/prisma"; import { logger } from '@/lib/logger'
import { stringifyJsonField, serializeConnector, successResponse, errorResponse } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { ConnectorCreateSchema, validateBody } from "@/lib/server/validators"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"
import { getEnrichedConnectors } from "@/lib/server/connectors"

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const connectors = await getEnrichedConnectors(ctx.workspaceId)
    return Response.json({ success: true, data: { connectors } }, { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" } })
  } catch (error) { logger.error('GET /api/connectors: 失败'); return errorResponse("服务器内部错误") }
}

export async function POST(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role)
    const rawBody = await request.json(); const parsed = validateBody(rawBody, ConnectorCreateSchema)
    if (parsed instanceof Response) return parsed; const body = parsed
    const connector = await prisma.connector.create({ data: { id: crypto.randomUUID(), workspaceId: ctx.workspaceId, name: body.name, iconEmoji: body.iconEmoji, description: body.description, status: body.status, category: body.category, source: body.source, version: body.version, health: body.health, lastSync: body.lastSync, permissions: stringifyJsonField(body.permissions), usedByAgents: stringifyJsonField(body.usedByAgents) } })
    void writeAuditLog({ actor: await actorFromSession(), action: "connector.create", targetType: "connector", targetId: connector.id, detail: `创建连接器 ${body.name}`, riskLevel: "medium", workspaceId: ctx.workspaceId })
    return successResponse({ connector: serializeConnector(connector as any) }, 201)
  } catch (error) { logger.error('POST /api/connectors: 失败'); return errorResponse("服务器内部错误") }
}
