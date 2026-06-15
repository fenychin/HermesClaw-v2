import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext, type WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import { actorFromSession } from "@/lib/server/audit"
import { auditedWrite } from "@/lib/server/audited-write"
import { ApiResponse } from "@/lib/server/api-response"
import { z } from "zod"

/** 序列化 Quotation，将 DateTime 转为 ISO 字符串 */
function serializeQuotation(quotation: {
  createdAt: Date
} & Record<string, unknown>) {
  return {
    ...quotation,
    createdAt: quotation.createdAt.toISOString(),
  }
}

/** 报价品项 Schema */
const QuotationCreateItemsSchema = z.object({
  inquiryId: z.string().min(1).max(100),
  items: z.array(z.object({
    name: z.string().min(1),
    qty: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    currency: z.string().min(1).max(10).optional().default("USD"),
  })).min(1),
  notes: z.string().optional(),
})

/** GET /api/quotations —— 获取报价列表，支持依据 inquiryId 过滤并按版本降序 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const url = new URL(request.url)
    const inquiryId = url.searchParams.get("inquiryId")

    const where: any = { workspaceId: ctx.workspaceId }
    if (inquiryId) {
      where.projectId = inquiryId
    }

    const quotations = await prisma.quotation.findMany({
      where,
      orderBy: inquiryId ? { version: "desc" } : { createdAt: "desc" },
    })
    return successResponse({ quotations: quotations.map(serializeQuotation) })
  } catch (error) {
    logger.error('GET /api/quotations: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

// POST /api/quotations
// 创建报价（写操作，需 MEMBER 以上角色）
// —— 接收 items，在服务端加权计算 totalAmount
// —— 自动递增该询盘的 version
// —— 创建 Quotation 记录，状态初始为 draft，流转关联 Inquiry 状态 replied → true
// —— 写入 AuditLog，且审计日志绝对不写入任何 items 详细隐私信息
export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const rawBody = await request.json()
    const parsed = QuotationCreateItemsSchema.safeParse(rawBody)
    if (!parsed.success) {
      return ApiResponse.error(`参数校验失败: ${parsed.error.message}`, 400)
    }
    const { inquiryId, items, notes } = parsed.data

    const actor = await actorFromSession()
    const quotationId = crypto.randomUUID()

    // 1. 校验关联询盘是否存在
    const inquiry = await prisma.inquiry.findFirst({
      where: {
        id: inquiryId,
        workspaceId: ctx.workspaceId,
      },
    })
    if (!inquiry) {
      return ApiResponse.error("关联询盘不存在", 404)
    }

    // 2. 服务端计算总额与货币
    let total = 0
    for (const item of items) {
      total += item.qty * item.unitPrice
    }
    const currency = items[0].currency || "USD"
    const totalAmount = total.toFixed(2)

    // 3. 自动递增该询盘关联报价的 version
    const latestQuote = await prisma.quotation.findFirst({
      where: {
        projectId: inquiryId,
        workspaceId: ctx.workspaceId,
      },
      orderBy: {
        version: "desc",
      },
    })
    const nextVersion = latestQuote ? latestQuote.version + 1 : 1

    // 4. 执行受审计的写操作
    // 注意：审计日志的 contextSnapshot 绝对不记录 items 以保证隐私安全
    const quotation = await auditedWrite(
      {
        actor,
        action: "quotation.create",
        targetType: "quotation",
        targetId: quotationId,
        detail: `创建报价: 关联询盘 ${inquiryId}，版本 V${nextVersion}，金额 ${totalAmount} ${currency}，品项数 ${items.length}`,
        riskLevel: "low",
        workspaceId: ctx.workspaceId,
        automationLevel: "L2",
        triggeredBy: "user",
        contextSnapshot: {
          inquiryId,
          version: nextVersion,
          totalAmount,
          currency,
          itemCount: items.length,
          notes: notes ? (notes.length > 100 ? notes.slice(0, 100) + "..." : notes) : undefined,
          step: "quotation-create-v2",
        },
      },
      async () => {
        const [created] = await prisma.$transaction([
          // 创建报价记录
          prisma.quotation.create({
            data: {
              id: quotationId,
              workspaceId: ctx.workspaceId,
              projectId: inquiryId,     // 软引用关联询盘
              totalAmount,
              currency,
              version: nextVersion,
              status: "draft",
            },
          }),
          // 流转询盘状态：replied=false → true（等效 "pending" → "quoted"）
          prisma.inquiry.update({
            where: { id: inquiryId },
            data: { replied: true },
          }),
        ])
        return created
      },
      {
        onSuccess: () => ({
          contextSnapshot: {
            quotationId,
            inquiryId,
            inquiryStatusTransition: "pending→quoted",
            totalAmount,
            version: nextVersion,
          },
        }),
      },
    )

    return ApiResponse.ok(serializeQuotation(quotation))
  } catch (error) {
    logger.error("POST /api/quotations: 创建报价失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return ApiResponse.error("创建报价失败", 500)
  }
}, "MEMBER")
