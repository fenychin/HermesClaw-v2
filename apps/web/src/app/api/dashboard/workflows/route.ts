/**
 * GET /api/dashboard/workflows — 工作台推荐工作流（Panel 2 数据源）
 *
 * 按 workspaceId + industryId 拉取 Workflow 列表，返回精简面板投影。
 * 三域归属：Hermes 控制核（Workflow 编排），数据来自 Prisma Workflow 表。
 */
import { prisma } from "@/lib/prisma"
import { ApiResponse } from "@/lib/server/api-response"
import { withRBAC } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"

export const GET = withRBAC(async (req: Request, ctx: WorkspaceContext) => {
  try {
    const { searchParams } = new URL(req.url)
    const industryId = searchParams.get("industryId") ?? undefined
    const limit = Math.min(Number(searchParams.get("limit")) || 5, 10)

    const where: Record<string, unknown> = {
      workspaceId: ctx.workspaceId,
      status: "active",
    }
    if (industryId) where.industryId = industryId

    const workflows = await prisma.workflow.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        nodes: true,
        industryId: true,
        templateId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    const items = workflows.map((wf) => {
      let nodesParsed: unknown[] = []
      try {
        nodesParsed =
          typeof wf.nodes === "string" ? JSON.parse(wf.nodes) : (wf.nodes as unknown[]) ?? []
      } catch { /* keep empty */ }
      return {
        id: wf.id,
        name: wf.name,
        description: wf.description,
        status: wf.status,
        nodeCount: Array.isArray(nodesParsed) ? nodesParsed.length : 0,
        industryId: wf.industryId,
        templateId: wf.templateId,
        createdAt: wf.createdAt.toISOString(),
        updatedAt: wf.updatedAt.toISOString(),
      }
    })

    return ApiResponse.ok({ workflows: items, total: items.length })
  } catch (error) {
    return ApiResponse.error(
      error instanceof Error ? error.message : "获取推荐工作流失败",
      500,
    )
  }
}, "VIEWER")
