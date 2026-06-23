/**
 * GET /api/v1/sandbox/scenario-results/:id
 *
 * 查询沙盘推演结果 —— Hermes 侧读接口。
 * 由 A4 Agent 执行完成后写入 WorkflowRun.outputContext，前端 P4 消费。
 */
import { NextRequest } from "next/server"
import { buildWorkspaceContext } from "@/lib/workspace"
import { getScenarioResult } from "@/lib/server/industry-intel-service"
import { ApiResponse } from "@/lib/server/api-response"
import { logger } from "@/lib/logger"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: runId } = await params

  try {
    const ctx = await buildWorkspaceContext(req)
    const result = await getScenarioResult(runId, ctx.workspaceId)

    if (!result) {
      return ApiResponse.apiError("推演结果不存在", 404, "SCENARIO_NOT_FOUND")
    }

    return ApiResponse.ok(result)
  } catch (error) {
    logger.error("[scenario-results] 查询失败", {
      runId,
      error: error instanceof Error ? error.message : String(error),
    })
    return ApiResponse.apiError("查询推演结果失败", 500, "SCENARIO_QUERY_ERROR")
  }
}
