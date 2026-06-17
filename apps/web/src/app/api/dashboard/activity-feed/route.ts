import { prisma } from "@/lib/prisma"; import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import type { WorkspaceContext } from "@/lib/workspace"; import { withRBAC } from "@/lib/server/api-handler"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const limit = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("limit") ?? "20", 10) || 20, 1), 100)
    const [intelItems, agentItems] = await Promise.all([
      prisma.marketIntelligence.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { publishedAt: "desc" }, take: limit }),
      prisma.agentLog.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" }, take: limit }),
    ])
    const intelFeed = intelItems.map((i: any) => ({ id: i.id, type: "intelligence", title: i.title, summary: i.summary, timestamp: i.publishedAt.toISOString(), meta: { impactLevel: i.impactLevel } }))
    const agentFeed = agentItems.map((a: any) => ({ id: a.id, type: "agent", title: a.taskName, summary: a.detail ?? "", timestamp: a.createdAt.toISOString(), meta: { status: a.status } }))
    const feed = [...intelFeed, ...agentFeed].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit)
    void writeAuditLog({ actor: await actorFromSession(), action: "dashboard.feed.read", targetType: "dashboard", targetId: "activity-feed", detail: `活动流 ${feed.length} 条`, riskLevel: "low", workspaceId: ctx.workspaceId })
    return successResponse({ feed })
  } catch (error) { logger.error("GET /api/dashboard/activity-feed: 失败"); return errorResponse("服务器内部错误") }
}, "VIEWER")
