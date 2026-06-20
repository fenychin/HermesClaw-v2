import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext, type WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import { listInquiries, createInquiry, type InquiryHandlerDeps } from "@foreign-trade/handlers/inquiry-handler"
import { validateBody, InquiryCreateSchema } from "@/lib/server/validators"
import { actorFromSession } from "@/lib/server/audit"
import { auditedWrite } from "@/lib/server/audited-write"
import { prisma } from "@/lib/prisma"

const deps: InquiryHandlerDeps = { prisma }

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const url = new URL(request.url)
    return successResponse(await listInquiries({ workspaceId: ctx.workspaceId, priority: url.searchParams.get("priority") || undefined, status: url.searchParams.get("status") || undefined, fromCountry: url.searchParams.get("fromCountry") || undefined, page: Math.max(Number(url.searchParams.get("page")) || 1, 1), limit: Math.min(Number(url.searchParams.get("limit")) || 20, 500) }, deps))
  } catch { return errorResponse("服务器内部错误") }
}, "VIEWER")

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const parsed = validateBody(await request.json(), InquiryCreateSchema); if (parsed instanceof Response) return parsed
  try {
    const result = await auditedWrite({ actor: await actorFromSession(), action: "inquiry.create", targetType: "inquiry", targetId: crypto.randomUUID(), detail: `创建询盘: ${parsed.subject.slice(0, 100)}`, riskLevel: "low", workspaceId: ctx.workspaceId, automationLevel: "L2", triggeredBy: "user" }, () => createInquiry({ workspaceId: ctx.workspaceId, ...parsed, countryCode: parsed.countryCode }, deps))
    return successResponse(result, 201)
  } catch { return errorResponse("创建询盘失败", 500) }
}, "MEMBER")
