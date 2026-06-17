import { prisma } from "@/lib/prisma"; import { logger } from "@/lib/logger"
import { successResponse, errorResponse, serializeWorkflow } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"; import type { Prisma } from "@/generated/prisma-v2/client"

const INDUSTRY_KEYWORDS: Record<string, string[]> = { "foreign-trade": ["询盘", "开发信", "客户画像", "报价", "样品", "订单", "展会", "跟进"] }

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request); const { searchParams } = new URL(request.url)
    const industry = searchParams.get("industry"); const status = searchParams.get("status") ?? "active"
    const where: Prisma.WorkflowWhereInput = { workspaceId: ctx.workspaceId, status }
    const keywords = industry ? INDUSTRY_KEYWORDS[industry] : null
    if (keywords) where.OR = keywords.map(kw => ({ name: { contains: kw } }))
    const workflows = await prisma.workflow.findMany({ where, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, description: true, status: true, nodes: true, edges: true, createdAt: true, updatedAt: true } })
    return successResponse({ workflows: workflows.map(wf => serializeWorkflow(wf)) })
  } catch (error) { logger.error("GET /api/workflows: 失败"); return errorResponse("服务器内部错误") }
}
