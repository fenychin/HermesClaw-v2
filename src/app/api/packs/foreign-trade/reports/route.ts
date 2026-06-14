import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { buildWorkspaceContext } from "@/lib/workspace"
import { writeAuditLog, actorFromSession } from "@/lib/server/shared/audit"
import { ApiResponse } from "@/lib/server/shared/api-response"

/**
 * GET /api/reports —— 获取报告列表（按生成时间倒序）
 * —— 查询参数：type（MORNING | EVENING | WEEKLY）、limit（默认 5）
 * —— RBAC: VIEWER+
 * —— AuditLog: dashboard.reports.read（low）
 * —— ALWAYS 包含 workspaceId（AGENTS.md §4.11）
 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const url = new URL(request.url)
    const type = url.searchParams.get("type") ?? undefined
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "5", 10) || 5,
      20,
    )

    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }
    if (type) where.type = type.toUpperCase()

    const reports = await prisma.report.findMany({
      where,
      orderBy: { generatedAt: "desc" },
      take: limit,
    })

    // 读操作审计（低风险，治理可溯源）
    const actor = await actorFromSession()
    await writeAuditLog({
      actor,
      action: "dashboard.reports.read",
      targetType: "dashboard",
      targetId: `workspace:${ctx.workspaceId}`,
      detail: `读取报告列表：type=${type ?? "all"}, limit=${limit}, 返回 ${reports.length} 条`,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
    })

    return ApiResponse.ok({ reports })
  } catch (error) {
    logger.error("GET /api/reports: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return ApiResponse.error("服务器内部错误")
  }
}
