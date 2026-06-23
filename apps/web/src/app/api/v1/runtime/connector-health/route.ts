/**
 * GET /api/v1/runtime/connector-health
 *
 * 数据源健康度 —— 只读接口。
 * 前端 P2 DataSourceHealthRow 轮询消费（10s）。
 */
import { NextRequest } from "next/server"
import { buildWorkspaceContext } from "@/lib/workspace"
import { getConnectorHealth } from "@/lib/server/industry-intel-service"
import { ApiResponse } from "@/lib/server/api-response"
import { logger } from "@/lib/logger"

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const ctx = await buildWorkspaceContext(req)
    const health = await getConnectorHealth(ctx.workspaceId)

    return ApiResponse.ok(health)
  } catch (error) {
    logger.error("[connector-health] 查询失败", {
      error: error instanceof Error ? error.message : String(error),
    })
    return ApiResponse.apiError("查询连接器健康度失败", 500, "CONNECTOR_HEALTH_ERROR")
  }
}
