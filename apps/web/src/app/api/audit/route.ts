import { prisma } from "@/lib/prisma"; import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"; import { buildWorkspaceContext } from "@/lib/workspace"

function serializeAuditLog(log: any) { return { ...log, createdAt: log.createdAt.toISOString() } }

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request); const { searchParams } = new URL(request.url)
    const page = Math.max(Number(searchParams.get("page")) || 1, 1)
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500)
    const where: Record<string, any> = { workspaceId: ctx.workspaceId }
    const actor = searchParams.get("actor"); if (actor) where.actor = actor
    const action = searchParams.get("action"); if (action) where.action = action
    const status = searchParams.get("status"); if (status) where.status = status
    const targetType = searchParams.get("targetType"); if (targetType) where.targetType = targetType
    const riskLevel = searchParams.get("riskLevel"); if (riskLevel) where.riskLevel = riskLevel
    const query = searchParams.get("query"); if (query) where.OR = [{ actor: { contains: query } }, { action: { contains: query } }, { targetType: { contains: query } }, { detail: { contains: query } }]
    const [logs, total] = await prisma.$transaction([prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }), prisma.auditLog.count({ where })])
    return successResponse({ logs: logs.map(serializeAuditLog), total, page, limit })
  } catch (error) { logger.error('GET /api/audit: 失败'); return errorResponse("服务器内部错误") }
}
