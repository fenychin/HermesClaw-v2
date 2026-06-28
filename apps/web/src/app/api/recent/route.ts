/**
 * /api/recent — 最近记录聚合端点
 *
 * 以 AuditLog 为单一真相源（CLAUDE.md §8.1）。
 * 支持 type 筛选（all | conversation | task | project | file | upgrade | workflow | approval | connector）
 *
 * 缓存策略：ETag + Cache-Control private max-age=5
 */
import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"
import { getRecentRecords } from "@/lib/server/recent-service"

export async function GET(request: Request) {
  const start = Date.now()
  try {
    const ctx = await buildWorkspaceContext(request)
    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type") ?? "all"

    const { records } = await getRecentRecords(ctx.workspaceId, type)

    // 弱 ETag：基于记录数 + 最新时间
    const latest = records[0]?.timestamp ?? "empty"
    const etag = `"${records.length}-${latest}"`
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304 })
    }

    const res = successResponse({ records })
    res.headers.set("ETag", etag)
    res.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=10")
    return res
  } catch (error) {
    logger.error("GET /api/recent: 失败")
    return errorResponse("服务器内部错误")
  }
}
