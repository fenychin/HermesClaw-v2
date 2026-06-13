import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { type WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import type { FeedItem } from "@/types/dashboard"

// ============================================================
// GET /api/dashboard/activity-feed
// ============================================================

/**
 * 获取 Dashboard 合并活动流
 * —— 合并 MarketIntelligence（情报） + AgentLog（智能体）记录，
 *     按时间戳倒序排列，返回统一 FeedItem 列表。
 *
 * Query: ?limit=N（默认 20）
 * RBAC: 最低 VIEWER（所有已认证用户可读）
 * 审计: 写入 dashboard.feed.read（riskLevel: low）
 *
 * AGENTS.md §4.11：每个 Prisma 查询均过滤 workspaceId。
 */
export const GET = withRBAC(
  async (request: Request, ctx: WorkspaceContext) => {
    try {
      const url = new URL(request.url)
      const limit = Math.min(
        Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1),
        100,
      )

      // 并行查询两表（各自过滤 workspaceId）
      const [intelItems, agentItems] = await Promise.all([
        prisma.marketIntelligence.findMany({
          where: { workspaceId: ctx.workspaceId },
          orderBy: { publishedAt: "desc" },
          take: limit,
        }),
        prisma.agentLog.findMany({
          where: { workspaceId: ctx.workspaceId },
          orderBy: { createdAt: "desc" },
          take: limit,
        }),
      ])

      // 映射为统一 FeedItem
      const intelFeed: FeedItem[] = intelItems.map((i) => ({
        id: i.id,
        type: "intelligence" as const,
        title: i.title,
        summary: i.summary,
        timestamp: i.publishedAt.toISOString(),
        meta: {
          source: i.source,
          impactLevel: i.impactLevel,
          intelligenceType: i.type,
          credibility: i.credibility,
        },
      }))

      const agentFeed: FeedItem[] = agentItems.map((a) => ({
        id: a.id,
        type: "agent" as const,
        title: a.taskName,
        summary: a.detail ?? "",
        timestamp: a.createdAt.toISOString(),
        meta: {
          source: a.source,
          riskLevel: a.riskLevel ?? null,
          status: a.status,
          agentId: a.agentId ?? null,
        },
      }))

      // 合并并按时间戳倒序，取前 limit 条
      const feed = [...intelFeed, ...agentFeed]
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(0, limit)

      // 审计日志（读操作，riskLevel: low）
      const actor = await actorFromSession()
      await writeAuditLog({
        actor,
        action: "dashboard.feed.read",
        targetType: "dashboard",
        targetId: "activity-feed",
        detail: `读取活动流（intel=${intelItems.length} agent=${agentItems.length} merged=${feed.length}）`,
        riskLevel: "low",
        workspaceId: ctx.workspaceId,
      })

      return successResponse({ feed })
    } catch (error) {
      logger.error("GET /api/dashboard/activity-feed: 失败", {
        error: error instanceof Error ? error.message : "未知错误",
      })
      return errorResponse("服务器内部错误")
    }
  },
  "VIEWER",
)
