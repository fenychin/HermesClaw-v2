import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import type { WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/shared/api-handler"
import { writeAuditLog, actorFromSession } from "@/lib/server/shared/audit"
import { countryCodeToFlag } from "@/lib/country-utils"

/** 沉默预警条目 */
interface SilenceAlert {
  country: string
  countryFlag: string
  /** 该国家最久未回复的天数 */
  silenceDays: number
  /** 该国家未回复询盘总数 */
  count: number
  /** 代表性公司名（取第一条） */
  sampleCompany: string
}

/**
 * GET /api/dashboard/silence-alerts
 * —— 查找超过 7 天未回复的询盘（沉默客户），按国家分组，取前 5 最严重
 * —— RBAC: VIEWER+（最低读权限）
 * —— AuditLog: dashboard.silence-alerts.read（low 风险）
 * —— ALWAYS 包含 workspaceId（AGENTS.md §4.11）
 */
export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000)

    // 查询所有超 7 天未回复的询盘
    const staleInquiries = await prisma.inquiry.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        replied: false,
        receivedAt: { lt: sevenDaysAgo },
      },
      select: {
        id: true,
        fromCountry: true,
        companyName: true,
        receivedAt: true,
      },
      orderBy: { receivedAt: "asc" },
    })

    // 按国家分组，计算沉默天数和数量
    const grouped = new Map<string, {
      oldestReceivedAt: Date
      count: number
      sampleCompany: string
      countryFlag: string
    }>()

    for (const inquiry of staleInquiries) {
      const country = inquiry.fromCountry || "??"
      const existing = grouped.get(country)
      if (existing) {
        existing.count++
        if (inquiry.receivedAt < existing.oldestReceivedAt) {
          existing.oldestReceivedAt = inquiry.receivedAt
          existing.sampleCompany = inquiry.companyName
        }
      } else {
        grouped.set(country, {
          oldestReceivedAt: inquiry.receivedAt,
          count: 1,
          sampleCompany: inquiry.companyName,
          countryFlag: countryCodeToFlag(country),
        })
      }
    }

    // 转换为数组，计算沉默天数，取前 5 按沉默天数降序
    const now = Date.now()
    const alerts: SilenceAlert[] = Array.from(grouped.entries())
      .map(([country, data]) => ({
        country,
        countryFlag: data.countryFlag,
        silenceDays: Math.floor(
          (now - data.oldestReceivedAt.getTime()) / 86400_000,
        ),
        count: data.count,
        sampleCompany: data.sampleCompany,
      }))
      .sort((a, b) => b.silenceDays - a.silenceDays)
      .slice(0, 5)

    // 读操作审计（低风险，治理可溯源）
    const actor = await actorFromSession()
    await writeAuditLog({
      actor,
      action: "dashboard.silence-alerts.read",
      targetType: "dashboard",
      targetId: `workspace:${ctx.workspaceId}`,
      detail: `沉默预警查询：${alerts.length} 个国家，合计 ${alerts.reduce((s, a) => s + a.count, 0)} 条未回复`,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
    })

    return successResponse({ alerts })
  } catch (error) {
    logger.error("GET /api/dashboard/silence-alerts: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}, "VIEWER")
