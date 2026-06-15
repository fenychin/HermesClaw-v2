import { withRBAC } from "@/lib/server/api-handler"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/foreign-trade/follow-up-reminders
 * 查询距今超过 7 天未进行报价或跟进更新的询盘列表及其总数，作为待跟进提醒。
 */
export const GET = withRBAC(async (request, ctx) => {
  const workspaceId = ctx.workspaceId

  // 1. 查询当前 Workspace 下的所有询盘及报价单
  const [inquiries, quotations] = await Promise.all([
    prisma.inquiry.findMany({
      where: { workspaceId },
      orderBy: { receivedAt: "desc" }
    }),
    prisma.quotation.findMany({
      where: { workspaceId }
    })
  ])

  // 2. 内存计算跟进天数，并过滤超过 7 天未跟进的项
  const overdueList = inquiries.map(inquiry => {
    const relatedQuotes = quotations.filter(q => q.projectId === inquiry.id)

    // 计算最后跟进时间
    let lastFollowUpAt = inquiry.receivedAt
    if (relatedQuotes.length > 0) {
      const quoteTimes = relatedQuotes.map(q => q.createdAt.getTime())
      lastFollowUpAt = new Date(Math.max(...quoteTimes))
    }

    // 计算最新联系天数
    const diffTime = Math.max(0, Date.now() - lastFollowUpAt.getTime())
    const daysSinceLastContact = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    return {
      id: inquiry.id,
      customerName: inquiry.companyName,
      country: inquiry.fromCountry,
      countryFlag: inquiry.countryFlag,
      product: inquiry.summary,
      priority: inquiry.priority === "mid" ? "medium" : inquiry.priority,
      replied: inquiry.replied,
      lastFollowUpAt: lastFollowUpAt.toISOString(),
      daysSinceLastContact
    }
  }).filter(item => item.daysSinceLastContact >= 7)

  // 3. 返回结果
  return Response.json({
    success: true,
    data: {
      reminders: overdueList,
      count: overdueList.length
    }
  })
}, "VIEWER")
