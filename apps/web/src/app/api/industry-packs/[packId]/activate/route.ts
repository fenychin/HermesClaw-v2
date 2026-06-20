import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { ApiResponse } from "@/lib/server/api-response"
import { loadIndustryManifest, clearCache } from "@hermesclaw/industry-pack-sdk"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { logger } from "@/lib/logger"; import type { WorkspaceContext } from "@/lib/workspace"

export const POST = withRBAC<RouteContext<{ packId: string }>>(async (_req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ packId: string }>) => {
  const { packId } = await routeCtx.params; const actor = await actorFromSession()
  const entry = await createAuditEntry({ actor, action: "industry.pack.activate", targetType: "industry-pack", targetId: packId, detail: `激活行业包: ${packId}`, riskLevel: "medium", workspaceId: ctx.workspaceId, triggeredBy: "user" })
  try {
    const manifest = loadIndustryManifest(packId); clearCache()
    await updateAuditEntry({ auditId: entry.auditId, status: "success", detail: `行业包 ${packId} v${manifest.version} 已激活` })
    return ApiResponse.ok({ packId, version: manifest.version, name: manifest.name, activatedAt: new Date().toISOString(), message: `行业包 ${packId} 已成功激活` })
  } catch (error) { const msg = error instanceof Error ? error.message : "激活失败"; await updateAuditEntry({ auditId: entry.auditId, status: "failed", detail: `激活失败: ${msg}` }); return ApiResponse.error(msg, (msg.includes("not found") || msg.includes("ENOENT")) ? 404 : 500) }
}, "ADMIN")
