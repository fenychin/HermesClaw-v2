/**
 * DELETE /api/files/[id] — 软删除文件（标记 deletedAt，禁止物理删除审计轨迹）
 * PATCH  /api/files/[id] — 更新文件标签
 */
import { prisma } from "@/lib/prisma"
import { successResponse, errorResponse, parseJsonField } from "@/lib/api-utils"
import { withRBAC } from "@/lib/server/api-handler"
import { actorFromSession, createAuditEntry, updateAuditEntry } from "@/lib/server/audit"
import { logger } from "@/lib/logger"
import type { WorkspaceContext } from "@/lib/workspace"
import { unlink } from "fs/promises"
import { join } from "path"

export const runtime = "nodejs"

type RouteCtx = { params: Promise<{ id: string }> }

// ─── DELETE ─────────────────────────────────────────────────────────────────

export const DELETE = withRBAC(
  async (request: Request, ctx: WorkspaceContext, routeCtx: RouteCtx) => {
    const { id } = await routeCtx.params
    try {
      const record = await prisma.fileRecord.findFirst({
        where: { id, workspaceId: ctx.workspaceId, deletedAt: null },
      })
      if (!record) return errorResponse("文件不存在", 404)

      const actor = await actorFromSession()
      const auditEntry = await createAuditEntry({
        actor,
        action: "file.delete",
        targetType: "file",
        targetId: id,
        riskLevel: "low",
        automationLevel: "L2",
        triggeredBy: "user",
        workspaceId: ctx.workspaceId,
        detail: `删除文件: ${record.name}`,
        contextSnapshot: { fileName: record.name, size: record.size },
      })

      // 软删除：设置 deletedAt（遵循 AGENTS.md §3.5 禁止物理删除审计轨迹约定）
      await prisma.fileRecord.update({
        where: { id },
        data: { deletedAt: new Date() },
      })

      // 后台尝试清理磁盘文件（失败不阻断响应）
      void (async () => {
        try {
          const diskPath = join(process.cwd(), "public", record.url)
          await unlink(diskPath)
        } catch { /* 文件可能已不存在，静默忽略 */ }
      })()

      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "success",
        detail: `已软删除文件: ${record.name}`,
      })

      return successResponse({ deleted: true, id })
    } catch (err) {
      logger.error("DELETE /api/files/[id]: 失败", { id, error: err instanceof Error ? err.message : "未知" })
      return errorResponse("删除失败")
    }
  },
  "MEMBER",
)

// ─── PATCH ───────────────────────────────────────────────────────────────────

export const PATCH = withRBAC(
  async (request: Request, ctx: WorkspaceContext, routeCtx: RouteCtx) => {
    const { id } = await routeCtx.params
    try {
      const record = await prisma.fileRecord.findFirst({
        where: { id, workspaceId: ctx.workspaceId, deletedAt: null },
      })
      if (!record) return errorResponse("文件不存在", 404)

      const body = await request.json() as { tags?: string[]; category?: string; relatedProjectId?: string | null }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: Record<string, any> = {}
      if (Array.isArray(body.tags)) updateData.tags = JSON.stringify(body.tags)
      if (body.category) updateData.category = body.category
      if ("relatedProjectId" in body) updateData.relatedProjectId = body.relatedProjectId ?? null

      if (Object.keys(updateData).length === 0) return errorResponse("无有效更新字段", 400)

      const updated = await prisma.fileRecord.update({ where: { id }, data: updateData })

      return successResponse({
        id: updated.id,
        tags: parseJsonField(updated.tags, [] as string[]),
        category: updated.category,
        relatedProjectId: updated.relatedProjectId,
        updatedAt: updated.updatedAt.toISOString(),
      })
    } catch (err) {
      logger.error("PATCH /api/files/[id]: 失败", { id, error: err instanceof Error ? err.message : "未知" })
      return errorResponse("更新失败")
    }
  },
  "MEMBER",
)
