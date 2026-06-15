import { withRBAC } from "@/lib/server/api-handler"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/foreign-trade/funnel
 * 聚合外贸转化漏斗指标：Inquiry → Quotation → Sample → Order
 * 支持 30 天时间范围过滤、漏斗递减保护，并聚合返回折算为人民币 CNY 的累计成交金额。
 */
export const GET = withRBAC(async (request, ctx) => {
  const workspaceId = ctx.workspaceId
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // 1. 获取近 30 天的询盘与报价
  const [inquiries, quotations] = await Promise.all([
    prisma.inquiry.findMany({
      where: {
        workspaceId,
        receivedAt: { gte: thirtyDaysAgo }
      }
    }),
    prisma.quotation.findMany({
      where: {
        workspaceId,
        createdAt: { gte: thirtyDaysAgo }
      }
    })
  ])

  // 2. 计算各阶段数据（去重询盘口径以防止倒挂，并实现逻辑映射）
  const inquiryCount = inquiries.length

  // 有报价的去重询盘数
  const quotationInquiryIds = new Set(quotations.map(q => q.projectId))
  const quotationCount = quotationInquiryIds.size

  // 有样品标识的去重询盘数
  const sampleInquiryIds = new Set<string>()
  for (const inquiry of inquiries) {
    const hasQuotes = quotations.some(q => q.projectId === inquiry.id)
    const summaryLower = (inquiry.summary || '').toLowerCase()
    const isSample = summaryLower.includes('sample') || summaryLower.includes('test') || summaryLower.includes('trial') || summaryLower.includes('样品')
    if (isSample && hasQuotes) {
      sampleInquiryIds.add(inquiry.id)
    }
  }
  const sampleCount = sampleInquiryIds.size

  // 状态为 accepted 的成交订单去重询盘数
  const acceptedQuotes = quotations.filter(q => q.status === "accepted")
  const orderInquiryIds = new Set(acceptedQuotes.map(q => q.projectId))
  const orderCount = orderInquiryIds.size

  // 3. 递减逻辑保护：Inquiry >= Quotation >= Sample >= Order
  const finalInquiry = inquiryCount
  const finalQuotation = Math.min(quotationCount, finalInquiry)
  const finalSample = Math.min(sampleCount, finalQuotation)
  const finalOrder = Math.min(orderCount, finalSample)

  // 4. 计算转化率
  const rates = {
    inquiryToQuotation: finalInquiry > 0 ? Number((finalQuotation / finalInquiry).toFixed(4)) : 0,
    quotationToSample: finalQuotation > 0 ? Number((finalSample / finalQuotation).toFixed(4)) : 0,
    sampleToOrder: finalSample > 0 ? Number((finalOrder / finalSample).toFixed(4)) : 0,
    overall: finalInquiry > 0 ? Number((finalOrder / finalInquiry).toFixed(4)) : 0
  }

  // 5. 计算全部成交金额（所有 accepted 状态报价），并基于汇率折算为 CNY
  const allAcceptedQuotes = await prisma.quotation.findMany({
    where: {
      workspaceId,
      status: "accepted"
    }
  })

  const exchangeRates = await prisma.exchangeRate.findMany({
    where: { workspaceId }
  })

  let totalAcceptedAmountCNY = 0
  for (const quote of allAcceptedQuotes) {
    const amt = parseFloat(quote.totalAmount.replace(/[^0-9.]/g, ""))
    if (isNaN(amt)) continue

    if (quote.currency === "CNY") {
      totalAcceptedAmountCNY += amt
    } else if (quote.currency === "USD") {
      const rate = exchangeRates.find(r => r.pair === "USD/CNY")?.value || 7.25
      totalAcceptedAmountCNY += amt * rate
    } else if (quote.currency === "EUR") {
      const rate = exchangeRates.find(r => r.pair === "EUR/CNY")?.value || 7.88
      totalAcceptedAmountCNY += amt * rate
    } else {
      // 默认按 USD 折算
      const rate = exchangeRates.find(r => r.pair === "USD/CNY")?.value || 7.25
      totalAcceptedAmountCNY += amt * rate
    }
  }

  return Response.json({
    success: true,
    data: [
      { name: "Inquiry", value: finalInquiry },
      { name: "Quotation", value: finalQuotation },
      { name: "Sample", value: finalSample },
      { name: "Order", value: finalOrder }
    ],
    rates,
    totalAcceptedAmountCNY: Number(totalAcceptedAmountCNY.toFixed(2))
  })
}, "VIEWER")
