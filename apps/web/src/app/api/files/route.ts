/**
 * GET /api/files — 文件列表（分类过滤 + 关键词搜索 + 分页）
 * POST /api/files — （保留入口，实际上传走 /api/files/upload）
 */
import { prisma } from "@/lib/prisma"
import { successResponse, errorResponse, parseJsonField } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/** 将 FileRecord DB 记录序列化为前端 FileItem 格式 */
function serializeFileRecord(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    name: r.name as string,
    type: r.type as string,
    category: r.category as string,
    size: r.size as number,
    url: r.url as string,
    parseStatus: r.parseStatus as string,
    vectorIndexStatus: r.vectorIndexStatus as string,
    parseSummary: r.parseSummary as string | undefined,
    tags: parseJsonField(r.tags as string, [] as string[]),
    relatedProjectId: r.relatedProjectId as string | undefined,
    relatedProjectName: undefined as string | undefined, // 由下层 join 填充
    relatedAgentIds: [] as string[],
    versions: parseJsonField(r.versions as string, [] as unknown[]),
    operatedBy: r.operatedBy as string,
    createdAt: (r.createdAt as Date).toISOString(),
    updatedAt: (r.updatedAt as Date).toISOString(),
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const sp = new URL(request.url).searchParams
    const category = sp.get("category") || ""
    const q = sp.get("q") || ""
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10))
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "50", 10)))

    // 构造 where 条件（排除已软删除）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      workspaceId: ctx.workspaceId,
      deletedAt: null,
    }
    if (category && category !== "all") where.category = category
    if (q.trim()) {
      where.OR = [
        { name: { contains: q } },
        { tags: { contains: q } },
        { parseSummary: { contains: q } },
      ]
    }

    const [records, total] = await Promise.all([
      prisma.fileRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.fileRecord.count({ where }),
    ])

    // 批量查询关联项目名称（避免 N+1）
    const projectIds = [...new Set(records.map((r) => r.relatedProjectId).filter(Boolean))] as string[]
    let projectNameMap: Record<string, string> = {}
    if (projectIds.length > 0) {
      const projects = await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true },
      })
      projectNameMap = Object.fromEntries(projects.map((p) => [p.id, p.name]))
    }

    const files = records.map((r) => {
      const item = serializeFileRecord(r as unknown as Record<string, unknown>)
      if (item.relatedProjectId) {
        item.relatedProjectName = projectNameMap[item.relatedProjectId]
      }
      return item
    })

    return successResponse({ files, total, page, limit })
  } catch (err) {
    logger.error("GET /api/files: 失败", { error: err instanceof Error ? err.message : "未知" })
    return errorResponse("服务器内部错误")
  }
}
