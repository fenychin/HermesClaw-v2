import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { ApiResponse } from "@/lib/server/api-response"
import { loadIndustryManifest, clearCache } from "@hermesclaw/industry-pack-sdk"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { logger } from "@/lib/logger"; import type { WorkspaceContext } from "@/lib/workspace"
import { activatePack } from "@/lib/server/industry-pack-loader"
import { prisma } from "@/lib/prisma"

export const POST = withRBAC<RouteContext<{ packId: string }>>(async (_req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ packId: string }>) => {
  const { packId } = await routeCtx.params; const actor = await actorFromSession()
  const entry = await createAuditEntry({ actor, action: "industry.pack.activate", targetType: "industry-pack", targetId: packId, detail: `激活行业包: ${packId}`, riskLevel: "medium", workspaceId: ctx.workspaceId, triggeredBy: "user" })
  try {
    // 1. 检查是否存在安装记录
    const existing = await prisma.industryPackInstallation.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        packId
      },
      orderBy: {
        createdAt: "desc"
      }
    })

    if (!existing) {
      throw new Error(`行业包 ${packId} 尚未安装，请先执行安装`)
    }

    const manifest = loadIndustryManifest(packId)
    clearCache()

    // 2. 若当前状态是 paused，调用 activatePack 执行实质性的能力重新上线
    if (existing.status === "paused") {
      await activatePack(packId, ctx.workspaceId, actor || "system")
    } else if (existing.status !== "installed") {
      throw new Error(`无法启用状态为 ${existing.status} 的行业包，请重新安装`)
    }

    // 3. 更新审计日志，标记为成功
    await updateAuditEntry({ auditId: entry.auditId, status: "success", detail: `行业包 ${packId} v${manifest.version} 已激活启用` })
    return ApiResponse.ok({ packId, version: manifest.version, name: manifest.name, activatedAt: new Date().toISOString(), message: `行业包 ${packId} 已成功激活` })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "激活失败"
    await updateAuditEntry({ auditId: entry.auditId, status: "failed", detail: `激活失败: ${msg}` })
    return ApiResponse.error(msg, (msg.includes("not found") || msg.includes("ENOENT")) ? 404 : 500)
  }
}, "ADMIN")
