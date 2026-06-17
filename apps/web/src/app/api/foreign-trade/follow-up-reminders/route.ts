import { withRBAC } from "@/lib/server/api-handler"; import { prisma } from "@/lib/prisma"

export const GET = withRBAC(async (request: any, ctx: any) => {
  const [inquiries, quotations] = await Promise.all([prisma.inquiry.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { receivedAt: "desc" } }), prisma.quotation.findMany({ where: { workspaceId: ctx.workspaceId } })])
  const overdueList = inquiries.map((inquiry: any) => {
    const relatedQuotes = quotations.filter((q: any) => q.projectId === inquiry.id)
    let lastFollowUpAt = inquiry.receivedAt; if (relatedQuotes.length > 0) lastFollowUpAt = new Date(Math.max(...relatedQuotes.map((q: any) => q.createdAt.getTime())))
    const daysSinceLastContact = Math.floor(Math.max(0, Date.now() - lastFollowUpAt.getTime()) / 86400000)
    return { id: inquiry.id, customerName: inquiry.companyName, country: inquiry.fromCountry, countryFlag: inquiry.countryFlag, product: inquiry.summary, priority: inquiry.priority === "mid" ? "medium" : inquiry.priority, replied: inquiry.replied, lastFollowUpAt: lastFollowUpAt.toISOString(), daysSinceLastContact }
  }).filter((item: any) => item.daysSinceLastContact >= 7)
  return Response.json({ success: true, data: { reminders: overdueList, count: overdueList.length } })
}, "VIEWER")
