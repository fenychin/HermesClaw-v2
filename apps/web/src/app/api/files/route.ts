/**
 * GET /api/files — 文件列表查询（含分类/taskId 过滤）
 *
 * OpenClaw Runtime 职责层：返回完整的 Artifact 追踪链路。
 * 查询参数：?workspaceId=&category=&sourceType=&taskId=&search=&limit=&offset=
 */
import { prisma } from "@/lib/prisma"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { withRBAC } from "@/lib/server/api-handler"
import { logger } from "@/lib/logger"
import type { WorkspaceContext } from "@/lib/workspace"

export const runtime = "nodejs"

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const url = new URL(request.url)
    const category = url.searchParams.get("category") || undefined
    const sourceType = url.searchParams.get("sourceType") || undefined
    const taskId = url.searchParams.get("taskId") || undefined
    const search = url.searchParams.get("search") || undefined
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200)
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0)

    // 构建查询条件
    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }
    if (category) where.category = category
    if (sourceType) where.sourceType = sourceType
    if (taskId) where.taskId = taskId
    if (search) {
      where.OR = [
        { fileName: { contains: search, mode: "insensitive" } },
        { originalName: { contains: search, mode: "insensitive" } },
      ]
    }

    const [records, total] = await Promise.all([
      prisma.artifact.findMany({
        where: where as any,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.artifact.count({ where: where as any }),
    ])

    // 转换为前端 FileItem 格式
    const files = records.map((r) => ({
      id: r.id,
      name: r.fileName,
      type: r.originalName.split(".").pop()?.toLowerCase() || "",
      category: r.category,
      size: r.size,
      sourceType: r.sourceType as "artifact" | "user_upload",
      taskId: r.taskId,
      workflowRunId: r.workflowRunId,
      receiptHash: r.receiptHash,
      connectorId: r.connectorId,
      relatedProjectId: undefined,
      relatedProjectName: undefined,
      relatedAgentIds: [] as string[],
      parseStatus: r.parseStatus as "parsed" | "parsing" | "unparsed" | "failed",
      vectorIndexStatus: (r.vectorIndexed ? "indexed" : "unindexed") as "indexed" | "unindexed",
      parseSummary: r.parseSummary,
      tags: (r.tags as string[]) || [],
      versions: [] as any[],
      updatedAt: r.updatedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      operatedBy: r.operatedBy,
    }))

    return successResponse({ files, total, limit, offset })
  } catch (error) {
    logger.error("GET /api/files: 查询失败", { error: error instanceof Error ? error.message : String(error) })
    return errorResponse("文件列表查询失败")
  }
}, "VIEWER")
