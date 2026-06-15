/**
 * POST /api/industry/[packId]/install
 * —— 安装行业包（验证 manifest 并写入 AuditLog）
 *
 * RBAC: 仅 ADMIN/OWNER（AGENTS.md §4.11）
 * AuditLog: industry.pack.install（AGENTS.md §6.2 必须记录）
 *
 * 当前阶段：Industry Pack 以文件系统静态方式部署，
 * "安装"即验证 manifest 可被 SDK 正确加载，并写入审计凭证。
 * 未来版本将支持动态上传和热加载。
 */
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { ApiResponse } from "@/lib/server/api-response"
import { loadIndustryManifest } from "@/lib/industry-pack-sdk"
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
      action: "industry.pack.install",
      targetType: "industry-pack",
      targetId: packId,
      detail: `安装行业包: ${packId}`,
      riskLevel: "medium",
      workspaceId: ctx.workspaceId,
      triggeredBy: "user",
      contextSnapshot: { packId, workspaceId: ctx.workspaceId },
    })

    try {
      // 验证 manifest 可被 SDK 正常加载（Zod 强校验）
      const manifest = loadIndustryManifest(packId)

      logger.info(`[API] industry.pack.install 成功`, {
        packId,
        workspaceId: ctx.workspaceId,
        actor,
        manifest: { id: manifest.id, version: manifest.version },
      })

      // 更新预记录为 success
      await updateAuditEntry({
        auditId: entry.auditId,
        status: "success",
        detail: `行业包 ${packId} v${manifest.version} 安装验证通过`,
        contextSnapshot: {
          packId,
          version: manifest.version,
          compatibleHermesApi: manifest.compatibleHermesApi,
          compatibleRuntimeApi: manifest.compatibleRuntimeApi,
          installedAt: new Date().toISOString(),
        },
      })

      return ApiResponse.ok({
        packId,
        version: manifest.version,
        name: manifest.name,
        compatibleHermesApi: manifest.compatibleHermesApi,
        compatibleRuntimeApi: manifest.compatibleRuntimeApi,
        installedAt: new Date().toISOString(),
        message: `行业包 ${packId} 安装验证成功`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "安装失败"

      logger.error(`[API] industry.pack.install 失败`, {
        packId,
        workspaceId: ctx.workspaceId,
        error: message,
      })

      await updateAuditEntry({
        auditId: entry.auditId,
        status: "failed",
        detail: `行业包 ${packId} 安装失败: ${message}`,
      })

      const isNotFound = message.includes("not found") || message.includes("ENOENT")
      return ApiResponse.error(message, isNotFound ? 404 : 500)
    }
  },
  "ADMIN"
)
