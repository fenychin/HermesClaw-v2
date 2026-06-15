import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"

/** 序列化 AuditLog，将 DateTime 转为 ISO 字符串 */
function serializeAuditLog(log: { createdAt: Date } & Record<string, unknown>) {
  return {
    ...log,
    createdAt: log.createdAt.toISOString(),
  }
}

/** GET /api/audit —— 获取审计日志（支持分页、精确过滤以及模糊查询，按时间倒序） */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const { searchParams } = new URL(request.url)

    // 分页参数
    const page = Math.max(Number(searchParams.get("page")) || 1, 1)
    const limitParam = Number(searchParams.get("limit"))
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 500)
        : 100
    const skip = (page - 1) * limit

    // 过滤参数
    const actor = searchParams.get("actor") || undefined
    const action = searchParams.get("action") || undefined
    const status = searchParams.get("status") || undefined
    const targetType = searchParams.get("targetType") || undefined
    const riskLevel = searchParams.get("riskLevel") || undefined
    const query = searchParams.get("query") || undefined

    const where: Record<string, any> = {
      workspaceId: ctx.workspaceId,
    }

    if (actor) where.actor = actor
    if (action) where.action = action
    if (status) where.status = status
    if (targetType) where.targetType = targetType
    if (riskLevel) where.riskLevel = riskLevel

    if (query) {
      const q = query.trim()
      where.OR = [
        { actor: { contains: q } },
        { action: { contains: q } },
        { targetType: { contains: q } },
        { detail: { contains: q } },
      ]
    }

    // 事务并行查询列表与总数
    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ])

    return successResponse({
      logs: logs.map(serializeAuditLog),
      total,
      page,
      limit,
    })
  } catch (error) {
    logger.error('GET /api/audit: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}
