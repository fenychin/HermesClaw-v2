import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  serializeConnector,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { withRBAC } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { z } from "zod"

/** 连接器授权请求校验 */
const AuthorizeSchema = z.object({
  /** 授权码（模拟 OAuth callback code） */
  code: z.string().min(1, "授权码不能为空"),
  /** 可选：OAuth state 防 CSRF */
  state: z.string().optional(),
  /** 可选：授权范围覆盖 */
  scopes: z.array(z.string()).optional(),
})

/**
 * POST /api/connectors/[id]/authorize —— 连接器授权回调
 * - 模拟 OAuth 授权流程：接收授权码 → 验证 → 更新状态为 connected
 * - 写入 AuditLog(action='connector.authorize') 满足 AGENTS.md §4.3 可溯源要求
 */
export const POST = withRBAC<{ params: Promise<{ id: string }> }>(async (
  request: Request,
  ctx: WorkspaceContext,
  { params },
) => {
  try {
    const { id } = await params
    const rawBody = await request.json().catch(() => null)
    if (!rawBody) {
      return errorResponse("请求体无效", 400)
    }

    const parsed = AuthorizeSchema.safeParse(rawBody)
    if (!parsed.success) {
      return errorResponse(
        `授权参数校验失败: ${parsed.error.issues.map(i => i.message).join("; ")}`,
        400,
      )
    }
    const body = parsed.data

    const existing = await prisma.connector.findUnique({
      where: { id },
    })

    if (!existing) {
      return errorResponse("连接器不存在", 404)
    }

    if (existing.workspaceId !== ctx.workspaceId) {
      return errorResponse("无权访问该连接器", 403)
    }

    const actor = await actorFromSession()

    // 预记录审计（AGENTS.md §5 #3 禁止静默执行）
    const entry = await createAuditEntry({
      actor,
      action: "connector.authorize",
      targetType: "connector",
      targetId: id,
      detail: existing.name,
      riskLevel: "mid",
      workspaceId: ctx.workspaceId,
      automationLevel: "L2",
      triggeredBy: "user",
      contextSnapshot: {
        connectorName: existing.name,
        connectorType: existing.category,
        previousStatus: existing.status,
        scopes: body.scopes ?? [],
      },
    })

    try {
      // 模拟授权验证（生产环境此处调用真实的 OAuth token exchange）
      const updated = await prisma.connector.update({
        where: { id },
        data: {
          status: "connected",
          lastSync: new Date().toISOString(),
        },
      })

      await updateAuditEntry({
        auditId: entry.auditId,
        status: "success",
        detail: `${existing.name}（${existing.category}）：授权成功，状态 available → connected`,
        contextSnapshot: {
          postStatus: "connected",
          connectorType: existing.category,
          authorizedAt: new Date().toISOString(),
        },
      })

      logger.info('POST /api/connectors/[id]/authorize: 成功', {
        connectorId: id,
        connectorName: existing.name,
      })

      return successResponse({
        message: `连接器「${existing.name}」授权成功`,
        connector: serializeConnector(updated as unknown as Record<string, unknown>),
      })
    } catch (error) {
      await updateAuditEntry({
        auditId: entry.auditId,
        status: "failed",
        detail: `授权失败: ${error instanceof Error ? error.message : "未知错误"}`,
      })
      throw error
    }
  } catch (error) {
    logger.error('POST /api/connectors/[id]/authorize: 失败', {
      error: error instanceof Error ? error.message : '未知错误',
    })
    return errorResponse("连接器授权失败")
  }
}, "MEMBER")
