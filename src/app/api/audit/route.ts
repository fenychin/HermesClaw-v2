import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"

/** 序列化 AuditLog，将 DateTime 转为 ISO 字符串 */
function serializeAuditLog(log: { createdAt: Date } & Record<string, unknown>) {
  return {
    ...log,
    createdAt: log.createdAt.toISOString(),
  }
}

/** GET /api/audit?limit=100 —— 获取审计日志（按时间倒序，默认 100 条） */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limitParam = Number(searchParams.get("limit"))
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 500)
        : 100

    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    return successResponse({ logs: logs.map(serializeAuditLog) })
  } catch (error) {
    logger.error('GET /api/audit: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}
