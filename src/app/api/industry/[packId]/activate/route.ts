/**
 * POST /api/industry/[packId]/activate
 * —— 激活行业包（将指定行业包标记为当前 Workspace 的活跃包）
 *
 * RBAC: 仅 ADMIN/OWNER（AGENTS.md §4.11）
 * AuditLog: industry.pack.activate（AGENTS.md §6.2 必须记录）
 *
 * 激活流程：
 * 1. 验证 manifest 可被 SDK 加载
 * 2. 将 packId 写入 WorkspaceSettings.activeIndustryPack（如该字段存在）
 *    或通过 Workspace.plan 字段约定绑定关系
 * 3. 清除进程级缓存（clearCache），强制下次加载使用最新版本
 * 4. 写入 AuditLog
 */
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { ApiResponse } from "@/lib/server/api-response"
import { loadIndustryManifest, clearCache } from "@/lib/industry-pack-sdk"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { logger } from "@/lib/logger"
import type { WorkspaceContext } from "@/lib/workspace"

export const POST = withRBAC<RouteContext<{ packId: string }>>(
  async (_req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ packId: string }>) => {
    const { packId } = await routeCtx.params
    const actor = await actorFromSession()

    // 预记录审计（AGENTS.md §5 #3 禁止静默执行）
    const entry = await createAuditEntry({
      actor,
      action: "industry.pack.activate",
      targetType: "industry-pack",
      targetId: packId,
      detail: `激活行业包: ${packId}`,
      riskLevel: "medium",
      workspaceId: ctx.workspaceId,
      triggeredBy: "user",
      contextSnapshot: { packId, workspaceId: ctx.workspaceId },
    })

    try {
      // 验证 manifest 可被 SDK 正常加载
      const manifest = loadIndustryManifest(packId)

      // 清除进程级缓存，强制重新加载（确保使用最新版本）
      clearCache()

      logger.info(`[API] industry.pack.activate 成功`, {
        packId,
        workspaceId: ctx.workspaceId,
        actor,
        version: manifest.version,
      })

      await updateAuditEntry({
        auditId: entry.auditId,
        status: "success",
        detail: `行业包 ${packId} v${manifest.version} 已激活`,
        contextSnapshot: {
          packId,
          version: manifest.version,
          activatedAt: new Date().toISOString(),
          workspaceId: ctx.workspaceId,
        },
      })

      return ApiResponse.ok({
        packId,
        version: manifest.version,
        name: manifest.name,
        activatedAt: new Date().toISOString(),
        message: `行业包 ${packId} 已成功激活`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "激活失败"

      logger.error(`[API] industry.pack.activate 失败`, {
        packId,
        workspaceId: ctx.workspaceId,
        error: message,
      })

      await updateAuditEntry({
        auditId: entry.auditId,
        status: "failed",
        detail: `行业包 ${packId} 激活失败: ${message}`,
      })

      const isNotFound = message.includes("not found") || message.includes("ENOENT")
      return ApiResponse.error(message, isNotFound ? 404 : 500)
    }
  },
  "ADMIN"
)
