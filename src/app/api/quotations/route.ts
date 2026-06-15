import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext, type WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import { validateBody, QuotationCreateSchema } from "@/lib/server/validators"
import { actorFromSession } from "@/lib/server/audit"
import { auditedWrite } from "@/lib/server/audited-write"
import { ApiResponse } from "@/lib/server/api-response"

/** 序列化 Quotation，将 DateTime 转为 ISO 字符串 */
function serializeQuotation(quotation: {
  createdAt: Date
} & Record<string, unknown>) {
  return {
    ...quotation,
    createdAt: quotation.createdAt.toISOString(),
  }
}

/** GET /api/quotations —— 获取报价列表（按创建时间倒序） */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const quotations = await prisma.quotation.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
    })
    return successResponse({ quotations: quotations.map(serializeQuotation) })
  } catch (error) {
    logger.error('GET /api/quotations: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

// POST /api/quotations
// 创建报价（写操作，需 MEMBER 以上角色）
// —— 关联 inquiryId 到 projectId（软引用）
// —— 创建 Quotation 记录，状态初始为 draft
// —— 流转关联 Inquiry 状态：replied → true（等效 "quoted" 状态）
// —— 写入 AuditLog（actionType: quotation.create，automationLevel: L2）
export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  // 1. 参数校验
  const rawBody = await request.json()
  const parsed = validateBody(rawBody, QuotationCreateSchema)
  if (parsed instanceof Response) return parsed
  const body = parsed

  const actor = await actorFromSession()
  const quotationId = crypto.randomUUID()

  // 2. 校验关联询盘是否存在
  const inquiry = await prisma.inquiry.findFirst({
    where: {
      id: body.inquiryId,
      workspaceId: ctx.workspaceId,
    },
  })
  if (!inquiry) {
    return ApiResponse.error("关联询盘不存在", 404)
  }

  // 3-5. 预记录审计 + 事务（创建报价 + 流转询盘状态）+ 成功/失败回填，统一经 auditedWrite
  //      —— projectId 存储 inquiryId 作为软引用（Quotation 无 inquiryId 字段）
  try {
    const quotation = await auditedWrite(
      {
        actor,
        action: "quotation.create",
        targetType: "quotation",
        targetId: quotationId,
        detail: `创建报价: 关联询盘 ${body.inquiryId}，金额 ${body.totalAmount} ${body.currency}`,
        riskLevel: "low",
        workspaceId: ctx.workspaceId,
        automationLevel: "L2",
        triggeredBy: "user",
        contextSnapshot: {
          inquiryId: body.inquiryId,
          totalAmount: body.totalAmount,
          currency: body.currency,
          step: "quotation-create",
        },
      },
      async () => {
        const [created] = await prisma.$transaction([
          // 创建报价记录
          prisma.quotation.create({
            data: {
              id: quotationId,
              workspaceId: ctx.workspaceId,
              projectId: body.inquiryId,     // 软引用关联询盘
              totalAmount: body.totalAmount,
              currency: body.currency,
              version: body.version,
              status: "draft",
            },
          }),
          // 流转询盘状态：replied=false → true（等效 "pending" → "quoted"）
          prisma.inquiry.update({
            where: { id: body.inquiryId },
            data: { replied: true },
          }),
        ])
        return created
      },
      {
        onSuccess: () => ({
          contextSnapshot: {
            quotationId,
            inquiryId: body.inquiryId,
            inquiryStatusTransition: "pending→quoted",
            totalAmount: body.totalAmount,
          },
        }),
      },
    )

    return ApiResponse.ok(serializeQuotation(quotation))
  } catch (error) {
    logger.error("POST /api/quotations: 创建报价失败", {
      error: error instanceof Error ? error.message : "未知错误",
      inquiryId: body.inquiryId,
    })
    return ApiResponse.error("创建报价失败", 500)
  }
}, "MEMBER")
