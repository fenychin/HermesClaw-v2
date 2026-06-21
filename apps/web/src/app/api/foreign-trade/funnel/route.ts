import { withRBAC } from "@/lib/server/api-handler"; import { prisma } from "@/lib/prisma"

/**
 * 外贸转化漏斗 API
 * v3.40 — P1-2 修复：O(n²) 嵌套循环改用 Map 预索引 O(n+m)
 */

export const GET = withRBAC(async (request: any, ctx: any) => {
  const wsId = ctx.workspaceId;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  // 并行拉取所有需要的数据
  const [inquiries, quotations, exRates, acceptedQuotes] = await Promise.all([
    prisma.inquiry.findMany({ where: { workspaceId: wsId, receivedAt: { gte: thirtyDaysAgo } } }),
    prisma.quotation.findMany({ where: { workspaceId: wsId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.exchangeRate.findMany({ where: { workspaceId: wsId } }),
    prisma.quotation.findMany({ where: { workspaceId: wsId, status: "accepted" } }),
  ]);

  const inquiryCount = inquiries.length;

  // ↓ O(n+m)：用 Map/Set 预索引代替嵌套循环
  // quotationMap: projectId → quotation[] 快速查找
  const quotationByProject = new Map<string, any[]>();
  for (const q of quotations) {
    const arr = quotationByProject.get(q.projectId) || [];
    arr.push(q);
    quotationByProject.set(q.projectId, arr);
  }

  // 有报价的询盘数
  const quotationCount = quotationByProject.size;

  // 样品询盘数：有报价 + 摘要含 sample/test/trial/样品
  let sampleCount = 0;
  const sampleRe = /sample|test|trial|样品/i;
  for (const i of inquiries) {
    if (quotationByProject.has(i.id) && sampleRe.test(i.summary || "")) {
      sampleCount++;
    }
  }

  // 成交订单数：有 accepted 状态的报价
  const acceptedProjectIds = new Set(acceptedQuotes.map((q: any) => q.projectId));
  const orderCount = acceptedProjectIds.size;

  // 漏斗各阶段（确保递减，防止数据不一致导致倒挂）
  const fInq = inquiryCount;
  const fQuot = Math.min(quotationCount, fInq);
  const fSamp = Math.min(sampleCount, fQuot);
  const fOrd = Math.min(orderCount, fSamp);

  // 转化率
  const rates = {
    inquiryToQuotation: fInq > 0 ? +((fQuot / fInq).toFixed(4)) : 0,
    quotationToSample: fQuot > 0 ? +((fSamp / fQuot).toFixed(4)) : 0,
    sampleToOrder: fSamp > 0 ? +((fOrd / fSamp).toFixed(4)) : 0,
    overall: fInq > 0 ? +((fOrd / fInq).toFixed(4)) : 0,
  };

  // ↓ P1-2 修复：汇率表预索引为 Map，O(1) 查找替代 O(n) find
  const rateMap = new Map<string, number>();
  for (const r of exRates) {
    rateMap.set((r as any).pair, (r as any).value);
  }
  const defaultUSD = rateMap.get("USD/CNY") ?? 7.25;
  const defaultEUR = rateMap.get("EUR/CNY") ?? 7.88;

  let totalCNY = 0;
  for (const q of acceptedQuotes) {
    const raw = (q.totalAmount || "").replace(/[^0-9.]/g, "");
    const amt = parseFloat(raw);
    if (isNaN(amt)) continue;
    if (q.currency === "CNY") totalCNY += amt;
    else if (q.currency === "USD") totalCNY += amt * defaultUSD;
    else if (q.currency === "EUR") totalCNY += amt * defaultEUR;
    else totalCNY += amt * 7.25;
  }

  return Response.json({
    success: true,
    data: [
      { name: "Inquiry", value: fInq },
      { name: "Quotation", value: fQuot },
      { name: "Sample", value: fSamp },
      { name: "Order", value: fOrd },
    ],
    rates,
    totalAcceptedAmountCNY: +totalCNY.toFixed(2),
  });
}, "VIEWER")
