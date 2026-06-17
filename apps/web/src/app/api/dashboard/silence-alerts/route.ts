import { prisma } from "@/lib/prisma"; import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import type { WorkspaceContext } from "@/lib/workspace"; import { withRBAC } from "@/lib/server/api-handler"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { countryCodeToFlag } from "@/lib/country-utils"

export const GET = withRBAC(async (_request: Request, ctx: WorkspaceContext) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000)
    const staleInquiries = await prisma.inquiry.findMany({ where: { workspaceId: ctx.workspaceId, replied: false, receivedAt: { lt: sevenDaysAgo } }, select: { fromCountry: true, companyName: true, receivedAt: true }, orderBy: { receivedAt: "asc" } })
    const grouped = new Map<string, any>()
    for (const i of staleInquiries) {
      const country = i.fromCountry || "??"; const e = grouped.get(country)
      if (e) { e.count++; if (i.receivedAt < e.oldestReceivedAt) { e.oldestReceivedAt = i.receivedAt; e.sampleCompany = i.companyName } }
      else grouped.set(country, { oldestReceivedAt: i.receivedAt, count: 1, sampleCompany: i.companyName, countryFlag: countryCodeToFlag(country) })
    }
    const now = Date.now()
    const alerts = Array.from(grouped.entries()).map(([country, data]) => ({ country, countryFlag: data.countryFlag, silenceDays: Math.floor((now - data.oldestReceivedAt.getTime()) / 86400_000), count: data.count, sampleCompany: data.sampleCompany })).sort((a, b) => b.silenceDays - a.silenceDays).slice(0, 5)
    void writeAuditLog({ actor: await actorFromSession(), action: "dashboard.silence-alerts.read", targetType: "dashboard", targetId: `workspace:${ctx.workspaceId}`, detail: `沉默预警：${alerts.length} 个国家`, riskLevel: "low", workspaceId: ctx.workspaceId })
    return successResponse({ alerts })
  } catch (error) { logger.error("GET /api/dashboard/silence-alerts: 失败", { error: error instanceof Error ? error.message : "未知错误" }); return errorResponse("服务器内部错误") }
}, "VIEWER")
