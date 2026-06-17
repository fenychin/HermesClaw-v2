import { withRBAC } from "@/lib/server/api-handler"; import { prisma } from "@/lib/prisma"

export const GET = withRBAC(async (request: any, ctx: any) => {
  const wsId = ctx.workspaceId; const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
  const [inquiries, quotations] = await Promise.all([prisma.inquiry.findMany({ where: { workspaceId: wsId, receivedAt: { gte: thirtyDaysAgo } } }), prisma.quotation.findMany({ where: { workspaceId: wsId, createdAt: { gte: thirtyDaysAgo } } })])
  const inquiryCount = inquiries.length; const quotationInquiryIds = new Set(quotations.map((q: any) => q.projectId)); const quotationCount = quotationInquiryIds.size
  const sampleInquiryIds = new Set<string>(); for (const i of inquiries) { const hasQ = quotations.some((q: any) => q.projectId === i.id); if (hasQ && /sample|test|trial|样品/i.test(i.summary || "")) sampleInquiryIds.add(i.id) }; const sampleCount = sampleInquiryIds.size
  const acceptedQuotes = quotations.filter((q: any) => q.status === "accepted")
  const orderInquiryIds = new Set(acceptedQuotes.map((q: any) => q.projectId)); const orderCount = orderInquiryIds.size
  const fInq = inquiryCount; const fQuot = Math.min(quotationCount, fInq); const fSamp = Math.min(sampleCount, fQuot); const fOrd = Math.min(orderCount, fSamp)
  const rates = { inquiryToQuotation: fInq > 0 ? +((fQuot / fInq).toFixed(4)) : 0, quotationToSample: fQuot > 0 ? +((fSamp / fQuot).toFixed(4)) : 0, sampleToOrder: fSamp > 0 ? +((fOrd / fSamp).toFixed(4)) : 0, overall: fInq > 0 ? +((fOrd / fInq).toFixed(4)) : 0 }
  const allAccepted = await prisma.quotation.findMany({ where: { workspaceId: wsId, status: "accepted" } })
  const exRates = await prisma.exchangeRate.findMany({ where: { workspaceId: wsId } })
  let totalCNY = 0; for (const q of allAccepted) { const amt = parseFloat((q.totalAmount || "").replace(/[^0-9.]/g, "")); if (isNaN(amt)) continue; if (q.currency === "CNY") totalCNY += amt; else if (q.currency === "USD") totalCNY += amt * (exRates.find((r: any) => r.pair === "USD/CNY")?.value || 7.25); else if (q.currency === "EUR") totalCNY += amt * (exRates.find((r: any) => r.pair === "EUR/CNY")?.value || 7.88); else totalCNY += amt * 7.25 }
  return Response.json({ success: true, data: [{ name: "Inquiry", value: fInq }, { name: "Quotation", value: fQuot }, { name: "Sample", value: fSamp }, { name: "Order", value: fOrd }], rates, totalAcceptedAmountCNY: +totalCNY.toFixed(2) })
}, "VIEWER")
