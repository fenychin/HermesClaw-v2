import { prisma } from "@/lib/prisma"; import { logger } from "@/lib/logger"
import { buildWorkspaceContext } from "@/lib/workspace"; import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { ApiResponse } from "@/lib/server/api-response"

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request); const url = new URL(request.url)
    const type = url.searchParams.get("type") ?? undefined
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "5", 10) || 5, 20)
    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }
    if (type) where.type = type.toUpperCase()
    const reports = await prisma.report.findMany({ where, orderBy: { generatedAt: "desc" }, take: limit })
    void writeAuditLog({ actor: await actorFromSession(), action: "dashboard.reports.read", targetType: "dashboard", targetId: `workspace:${ctx.workspaceId}`, detail: `读取报告 ${reports.length} 条`, riskLevel: "low", workspaceId: ctx.workspaceId })
    return ApiResponse.ok({ reports })
  } catch (error) { logger.error("GET /api/reports: 失败"); return ApiResponse.error("服务器内部错误") }
}
