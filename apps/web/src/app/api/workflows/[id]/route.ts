import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse, serializeWorkflow } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"

/** GET /api/workflows/[id] —— 获取单个工作流定义（含解析后的 nodes / edges） */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)

    const workflow = await prisma.workflow.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        OR: [
          { id },
          { id: `${ctx.workspaceId}:${id}` }
        ]
      },
    })

    if (!workflow) {
      return Response.json(
        { success: false, error: "工作流不存在" },
        { status: 404 },
      )
    }

    return successResponse(serializeWorkflow(workflow))
  } catch (error) {
    logger.error("GET /api/workflows/[id]: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}
