/**
 * GET /api/v1/industry/knowledge-graph
 *
 * 行业生态星云全量图谱 —— Hermes 侧读接口。
 * 前端 P3 初始化时拉取（最大 500 节点），后续通过 SSE 差量更新。
 */
import { NextRequest } from "next/server"
import { buildWorkspaceContext } from "@/lib/workspace"
import { getKnowledgeGraph } from "@/lib/server/industry-intel-service"
import { ApiResponse } from "@/lib/server/api-response"
import { logger } from "@/lib/logger"

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const industryId = searchParams.get("packId") ?? searchParams.get("industryId") ?? "industry-intelligence-v2"

  try {
    const ctx = await buildWorkspaceContext(req)
    const graph = await getKnowledgeGraph({
      workspaceId: ctx.workspaceId,
      industryId,
    })

    return ApiResponse.ok(graph)
  } catch (error) {
    logger.error("[knowledge-graph] 获取失败", {
      error: error instanceof Error ? error.message : String(error),
    })
    return ApiResponse.apiError("获取知识图谱失败", 500, "KNOWLEDGE_GRAPH_ERROR")
  }
}
