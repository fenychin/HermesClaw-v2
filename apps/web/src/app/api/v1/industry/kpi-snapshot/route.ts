/**
 * GET /api/v1/industry/kpi-snapshot
 *
 * 行业情报总快照 —— Hermes 侧读接口。
 * 由 A1 战略态势感知 Agent 定时心跳产出，前端 TopBar/P1/P5 消费。
 */
import { NextRequest } from "next/server"
import { buildWorkspaceContext } from "@/lib/workspace"
import { getKpiSnapshot } from "@/lib/server/industry-intel-service"
import { ApiResponse } from "@/lib/server/api-response"
import { logger } from "@/lib/logger"

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const industryId = searchParams.get("packId") ?? searchParams.get("industryId") ?? "industry-intelligence-v2"

  try {
    const ctx = await buildWorkspaceContext(req)
    const snapshot = await getKpiSnapshot({
      workspaceId: ctx.workspaceId,
      industryId,
    })

    if (!snapshot) {
      return ApiResponse.error("快照数据不可用", 503)
    }

    return ApiResponse.ok(snapshot)
  } catch (error) {
    logger.error("[kpi-snapshot] 获取失败", {
      error: error instanceof Error ? error.message : String(error),
    })
    return ApiResponse.apiError("获取行业情报快照失败", 500, "KPI_SNAPSHOT_ERROR")
  }
}
