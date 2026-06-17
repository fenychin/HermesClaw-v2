import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"
import { writeAgentLog } from "@/lib/server/agent-log"
import { getRecentRecords } from "@/lib/server/recent-service"

export async function GET(request: Request) {
  const start = Date.now()
  try {
    const ctx = await buildWorkspaceContext(request); const url = new URL(request.url)
    return successResponse(await getRecentRecords(ctx.workspaceId, url.searchParams.get("type") ?? "all", url.searchParams.get("industry") ?? undefined))
  } catch (error) {
    logger.error("GET /api/recent: 失败")
    void writeAgentLog({ source: "hermes-chat", taskName: "最近记录聚合", status: "error", duration: `${((Date.now() - start) / 1000).toFixed(1)}s`, detail: error instanceof Error ? error.message : "聚合失败" })
    return errorResponse("服务器内部错误")
  }
}
