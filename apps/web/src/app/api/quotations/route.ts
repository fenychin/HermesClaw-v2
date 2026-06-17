import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext, type WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import { ApiResponse } from "@/lib/server/api-response"
import { z } from "zod"
import { listQuotations, createQuotationFromItems, serializeQuotation, QuotationServiceError } from "@/lib/server/quotation-service"

const QuotationCreateItemsSchema = z.object({ inquiryId: z.string().min(1).max(100), items: z.array(z.object({ name: z.string().min(1), qty: z.number().positive(), unitPrice: z.number().nonnegative(), currency: z.string().min(1).max(10).optional().default("USD") })).min(1), notes: z.string().optional() })

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    return successResponse({ quotations: await listQuotations(ctx.workspaceId, new URL(request.url).searchParams.get("inquiryId")) })
  } catch { logger.error('GET /api/quotations: 失败'); return errorResponse("服务器内部错误") }
}

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const parsed = QuotationCreateItemsSchema.safeParse(await request.json())
  if (!parsed.success) return ApiResponse.error(`参数校验失败: ${parsed.error.message}`, 400)
  try { return ApiResponse.ok(serializeQuotation(await createQuotationFromItems(ctx.workspaceId, parsed.data))) }
  catch (e) { if (e instanceof QuotationServiceError) return ApiResponse.error(e.message, e.httpStatus); return ApiResponse.error("创建报价失败", 500) }
}, "MEMBER")
