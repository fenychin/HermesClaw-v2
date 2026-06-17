/**
 * Quotation Service
 */
import { prisma } from "@/lib/prisma"
import { auditedWrite } from "@/lib/server/audited-write"
import { actorFromSession } from "@/lib/server/audit"

export class QuotationServiceError extends Error {
  constructor(public readonly httpStatus: number, message: string) { super(message); this.name = "QuotationServiceError" }
}

export function serializeQuotation(q: any) { return { ...q, createdAt: q.createdAt.toISOString() } }

export async function listQuotations(workspaceId: string, inquiryId: string | null) {
  const where: any = { workspaceId }; if (inquiryId) where.projectId = inquiryId
  const quotations = await prisma.quotation.findMany({ where, orderBy: inquiryId ? { version: "desc" } : { createdAt: "desc" } })
  return quotations.map(serializeQuotation)
}

export async function createQuotationFromItems(workspaceId: string, input: { inquiryId: string; items: Array<{ name: string; qty: number; unitPrice: number; currency?: string }>; notes?: string }) {
  const { inquiryId, items } = input
  const inquiry = await prisma.inquiry.findFirst({ where: { id: inquiryId, workspaceId } })
  if (!inquiry) throw new QuotationServiceError(404, "关联询盘不存在")
  let total = 0; for (const item of items) total += item.qty * item.unitPrice
  const currency = items[0].currency || "USD"; const totalAmount = total.toFixed(2)
  const latestQuote = await prisma.quotation.findFirst({ where: { projectId: inquiryId, workspaceId }, orderBy: { version: "desc" } })
  const nextVersion = latestQuote ? latestQuote.version + 1 : 1
  const actor = await actorFromSession(); const quotationId = crypto.randomUUID()
  return auditedWrite({ actor, action: "quotation.create", targetType: "quotation", targetId: quotationId, detail: `创建报价: V${nextVersion}, ${totalAmount} ${currency}`, riskLevel: "low", workspaceId, automationLevel: "L2", triggeredBy: "user", contextSnapshot: { inquiryId, version: nextVersion, totalAmount, currency, itemCount: items.length } }, async () => {
    const [created] = await prisma.$transaction([prisma.quotation.create({ data: { id: quotationId, workspaceId, projectId: inquiryId, totalAmount, currency, version: nextVersion, status: "draft" } }), prisma.inquiry.update({ where: { id: inquiryId }, data: { replied: true } })])
    return created
  })
}
