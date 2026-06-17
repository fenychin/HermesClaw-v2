import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { ApiResponse } from "@/lib/server/api-response"; import { loadIndustryManifest } from "@hermesclaw/industry-pack-sdk"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { logger } from "@/lib/logger"; import type { WorkspaceContext } from "@/lib/workspace"

export const POST = withRBAC<RouteContext<{ packId: string }>>(async (_req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ packId: string }>) => {
  const { packId } = await routeCtx.params; const actor = await actorFromSession()
  const entry = await createAuditEntry({ actor, action: "industry.pack.install", targetType: "industry-pack", targetId: packId, detail: `安装行业包: ${packId}`, riskLevel: "medium", workspaceId: ctx.workspaceId, triggeredBy: "user" })
  try {
    const manifest = loadIndustryManifest(packId)
    await updateAuditEntry({ auditId: entry.auditId, status: "success", detail: `行业包 ${packId} v${manifest.version} 安装成功` })
    return ApiResponse.ok({ packId, version: manifest.version, name: manifest.name, installedAt: new Date().toISOString(), message: `行业包 ${packId} 安装成功` })
  } catch (error) { const msg = error instanceof Error ? error.message : "安装失败"; await updateAuditEntry({ auditId: entry.auditId, status: "failed", detail: `安装失败: ${msg}` }); return ApiResponse.error(msg, (msg.includes("not found") || msg.includes("ENOENT")) ? 404 : 500) }
}, "ADMIN")
