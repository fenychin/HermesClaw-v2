import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { ApiResponse } from "@/lib/server/api-response"; import { clearCache } from "@hermesclaw/industry-pack-sdk"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { logger } from "@/lib/logger"; import { z } from "zod"; import type { WorkspaceContext } from "@/lib/workspace"

const RollbackIndustryPackSchema = z.object({ operatorId: z.string().optional(), confirmationToken: z.string().optional() })
const INDUSTRY_ROLLBACK_TOKEN = process.env["INDUSTRY_PACK_ROLLBACK_TOKEN"] ?? "CONFIRM_INDUSTRY_ROLLBACK"

export const POST = withRBAC<RouteContext<{ packId: string }>>(async (req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ packId: string }>) => {
  const { packId } = await routeCtx.params; const actor = await actorFromSession()
  let body: any = {}
  try { const raw = await req.json(); const parsed = RollbackIndustryPackSchema.safeParse(raw); if (parsed.success) body = parsed.data } catch {}
  if (body.confirmationToken !== INDUSTRY_ROLLBACK_TOKEN) return ApiResponse.error("行业包回滚属高危操作，请携带正确的 confirmationToken", 409)
  const entry = await createAuditEntry({ actor, action: "industry.pack.rollback", targetType: "industry-pack", targetId: packId, detail: `回滚行业包: ${packId}`, riskLevel: "high", workspaceId: ctx.workspaceId, triggeredBy: "user" })
  try {
    clearCache(packId)
    await updateAuditEntry({ auditId: entry.auditId, status: "success", detail: `行业包 ${packId} 缓存已清除` })
    return ApiResponse.ok({ packId, rolledBackAt: new Date().toISOString(), message: `行业包 ${packId} 已回滚` })
  } catch (error) { const msg = error instanceof Error ? error.message : "回滚失败"; await updateAuditEntry({ auditId: entry.auditId, status: "failed", detail: `回滚失败: ${msg}` }); return ApiResponse.error(msg, 500) }
}, "ADMIN")
