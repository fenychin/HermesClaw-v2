/**
 * GET /api/workflows —— 获取工作流列表
 *
 * 支持查询参数：
 *   ?industry=foreign-trade   按行业筛选（匹配 Workflow.name 或 category 标签）
 *   ?status=active            按状态筛选（默认仅返回 active）
 *
 * 响应体：ApiResponse<{ workflows: Workflow[] }>
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse, serializeWorkflow } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"
import type { Prisma } from "@/generated/prisma-v2/client"

/** GET /api/workflows —— 获取当前 workspace 的工作流列表 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const { searchParams } = new URL(request.url)
    const industry = searchParams.get("industry")
    const status = searchParams.get("status") ?? "active"

    // 构建查询条件
    const where: Prisma.WorkflowWhereInput = {
      workspaceId: ctx.workspaceId,
      status,
    }

    // 行业筛选：外贸行业的工作流名称包含外贸常见关键词
    if (industry === "foreign-trade") {
      where.OR = [
        { name: { contains: "询盘" } },
        { name: { contains: "开发信" } },
        { name: { contains: "客户画像" } },
        { name: { contains: "报价" } },
        { name: { contains: "样品" } },
        { name: { contains: "订单" } },
        { name: { contains: "展会" } },
        { name: { contains: "跟进" } },
        { description: { contains: "询盘" } },
        { description: { contains: "外贸" } },
        { description: { contains: "客户" } },
      ]
    }

    const workflows = await prisma.workflow.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        nodes: true,
        edges: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return successResponse({
      workflows: workflows.map((wf) => serializeWorkflow(wf)),
    })
  } catch (error) {
    logger.error("GET /api/workflows: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}
