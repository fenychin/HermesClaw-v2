/**
 * POST /api/industry/[packId]/rollback
 * —— 回滚行业包（清除缓存并写入 AuditLog，恢复到上一个已知稳定状态）
 *
 * RBAC: 仅 ADMIN/OWNER（AGENTS.md §4.11）
 * AuditLog: industry.pack.rollback（AGENTS.md §6.2 必须记录）
 *
 * 当前阶段的回滚语义：
 * - 清除指定 packId 的所有进程级 SDK 缓存
 * - 下次调用将重新从文件系统加载（可配合部署工具回滚文件版本后调用此 API）
 * - 写入 industry.pack.rollback 审计，保证操作可溯源
 *
 * L3 高危操作保护：需要 body.confirmationToken 进行二次确认。
 */
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { ApiResponse } from "@/lib/server/api-response"
import { clearCache } from "@/lib/industry-pack-sdk"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { logger } from "@/lib/logger"
import { z } from "zod"
import type { WorkspaceContext } from "@/lib/workspace"

const RollbackIndustryPackSchema = z.object({
  /** 操作者标识（可选，用于增强审计追踪） */
  operatorId: z.string().optional(),
  /** L3 二次确认令牌（回滚属高危操作，须显式确认） */
  confirmationToken: z.string().optional(),
})

/** L3 回滚确认令牌 */
const INDUSTRY_ROLLBACK_TOKEN =
  process.env["INDUSTRY_PACK_ROLLBACK_TOKEN"] ?? "CONFIRM_INDUSTRY_ROLLBACK"

export const POST = withRBAC<RouteContext<{ packId: string }>>(
  async (req: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ packId: string }>) => {
    const { packId } = await routeCtx.params
    const actor = await actorFromSession()

    // 解析请求体（容错：允许空 body）
    let body: z.infer<typeof RollbackIndustryPackSchema> = {}
    try {
      const raw = await req.json()
      const parsed = RollbackIndustryPackSchema.safeParse(raw)
      if (parsed.success) body = parsed.data
    } catch {
      // 允许空 body
    }

    // L3 高危操作：必须携带正确的 confirmationToken
    if (body.confirmationToken !== INDUSTRY_ROLLBACK_TOKEN) {
      return ApiResponse.error(
        "行业包回滚属高危操作，请携带正确的 confirmationToken（INDUSTRY_PACK_ROLLBACK_TOKEN）进行二次确认",
        409,
      )
    }

    // 预记录审计（AGENTS.md §5 #3 禁止静默执行）
    const entry = await createAuditEntry({
      actor,
      action: "industry.pack.rollback",
      targetType: "industry-pack",
      targetId: packId,
      detail: `回滚行业包缓存: ${packId}（操作者: ${body.operatorId ?? actor}）`,
      riskLevel: "high",
      workspaceId: ctx.workspaceId,
      triggeredBy: "user",
      contextSnapshot: {
        packId,
        workspaceId: ctx.workspaceId,
        operatorId: body.operatorId ?? actor,
      },
    })

    try {
      // 清除指定 packId 的所有 SDK 进程级缓存
      // 下次请求将重新从文件系统加载（可配合部署工具回滚文件后调用）
      clearCache(packId)

      logger.info(`[API] industry.pack.rollback 成功`, {
        packId,
        workspaceId: ctx.workspaceId,
        actor,
        operatorId: body.operatorId,
      })

      await updateAuditEntry({
        auditId: entry.auditId,
        status: "success",
        detail: `行业包 ${packId} 缓存已清除，下次请求将重新加载`,
        contextSnapshot: {
          packId,
          rolledBackAt: new Date().toISOString(),
          operatorId: body.operatorId ?? actor,
        },
      })

      return ApiResponse.ok({
        packId,
        rolledBackAt: new Date().toISOString(),
        message: `行业包 ${packId} 已回滚（缓存已清除，下次请求将重新加载文件系统版本）`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "回滚失败"

      logger.error(`[API] industry.pack.rollback 失败`, {
        packId,
        workspaceId: ctx.workspaceId,
        error: message,
      })

      await updateAuditEntry({
        auditId: entry.auditId,
        status: "failed",
        detail: `行业包 ${packId} 回滚失败: ${message}`,
      })

      return ApiResponse.error(message, 500)
    }
  },
  "ADMIN"
)
