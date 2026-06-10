import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse, parseJsonField } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"

/** 将 DB 中的 JSON 字符串 nodes/edges 解析为结构化对象 */
function serializeWorkflow(wf: { nodes: string | object; edges: string | object } & Record<string, unknown>) {
  const nodes = typeof wf.nodes === "string" ? parseJsonField(wf.nodes, []) : wf.nodes
  const edges = typeof wf.edges === "string" ? parseJsonField(wf.edges, []) : wf.edges
  return { ...wf, nodes, edges }
}

/** GET /api/workflows/[id] —— 获取单个工作流定义（含解析后的 nodes / edges） */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)

    const workflow = await prisma.workflow.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
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
