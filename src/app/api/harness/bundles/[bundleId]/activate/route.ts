/**
 * POST /api/harness/bundles/[bundleId]/activate
 *
 * 将 CANARY 状态的 HarnessBundle 全量激活为 ACTIVE（CLAUDE.md §4.2 / §8.1）。
 *
 * 治理护栏（AGENTS.md §4.7 + §4.11）：
 * - RBAC: 仅 ADMIN/OWNER（withRBAC），VIEWER/MEMBER 返回 403
 * - L3 二次确认：必须提供有效的 confirmationToken，缺失/错误返回 409
 * - L4 动作硬拒绝（虽然激活通常是 L3，留 gate 作为统一防线）
 * - 幂等：Idempotency-Key 命中直接返回
 * - 预记录审计两段式：createAuditEntry → 业务事务 → updateAuditEntry
 *
 * 业务事务（一次 prisma.$transaction）：
 *   1. 创建 reason="pre-activation" 快照
 *   2. 把同 workspace 内其他 ACTIVE bundle 标记为 DEPRECATED
 *   3. 把当前 bundle 写为 ACTIVE / canaryPercent=100 / activatedAt=now
 *   4. 关联到该 bundle 且 status="approved" 的 HarnessProposal 标记为 "activated"
 */

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { ApiResponse } from "@/lib/server/shared/api-response"
import {
  withRBAC,
  type RouteContext,
} from "@/lib/server/shared/api-handler"
import {
  actorFromSession,
  createAuditEntry,
  updateAuditEntry,
} from "@/lib/server/shared/audit"
import { checkAutomationGate } from "@/lib/server/hermes/guardrail"
import {
  readIdempotencyKey,
  checkIdempotencyKey,
  storeIdempotencyKey,
} from "@/lib/idempotency"
import { validateBody } from "@/lib/validators"
import {
  InvalidTransitionError,
  validateTransition,
} from "@/lib/server/harness/bundle-state-machine"
import { createBundleSnapshot } from "@/lib/server/harness/bundle-snapshot"
import type { HarnessBundleStatus } from "@hermesclaw/harness-schema"
import type { WorkspaceContext } from "@/lib/workspace"

// ==============================
// 请求体 Schema
// ==============================

const ActivateRequestSchema = z.object({
  /** L3 二次确认 Token */
  confirmationToken: z.string().optional(),
})

/** L3 二次确认 Token —— 与 proposals/[id]/rollback 路由共用同一约定 */
const L3_CONFIRMATION_TOKEN =
  process.env["HARNESS_L3_CONFIRMATION_TOKEN"] ?? "确认回滚"

export const POST = withRBAC(
  async (
    req: Request,
    ctx: WorkspaceContext,
    routeCtx: RouteContext<{ bundleId: string }>,
  ) => {
    let preAuditId: string | null = null

    try {
      const { bundleId } = await routeCtx.params

      // 1. 幂等命中
      const idempotencyKey = readIdempotencyKey(req)
      if (idempotencyKey) {
        const hit = await checkIdempotencyKey(ctx.workspaceId, idempotencyKey)
        if (hit) {
          return ApiResponse.ok({
            idempotent: true,
            bundleId: hit.taskId,
            activatedAt: hit.createdAt.toISOString(),
          })
        }
      }

      // 2. 解析请求体
      let body: z.infer<typeof ActivateRequestSchema>
      try {
        const raw = await req.json().catch(() => ({}))
        const parsed = validateBody(raw ?? {}, ActivateRequestSchema)
        if (parsed instanceof Response) return parsed
        body = parsed
      } catch {
        return ApiResponse.error("请求体格式无效，须为合法 JSON", 400)
      }

      // 3. 读取并校验 bundle（workspace 隔离 §4.11）
      const bundle = await prisma.harnessBundle.findUnique({
        where: { bundleId },
      })
      if (!bundle || bundle.workspaceId !== ctx.workspaceId) {
        return ApiResponse.error("Bundle 不存在", 404)
      }

      // 4. 状态机校验：当前状态 → ACTIVE 是否合法
      try {
        validateTransition(bundle.status as HarnessBundleStatus, "ACTIVE")
      } catch (e) {
        if (e instanceof InvalidTransitionError) {
          return Response.json(
            {
              success: false,
              error: "INVALID_TRANSITION",
              message: e.message,
              available: e.available,
            },
            { status: 409 },
          )
        }
        throw e
      }

      // 5. 预记录审计（AGENTS.md §5 #3 禁止静默执行）
      const actor = await actorFromSession()
      const entry = await createAuditEntry({
        actor,
        action: "harness.bundle.activate",
        targetType: "harness_bundle",
        targetId: bundleId,
        detail: `将 bundle ${bundleId}（${bundle.status}）激活为 ACTIVE`,
        riskLevel: "high",
        workspaceId: ctx.workspaceId,
        automationLevel: "L3",
        triggeredBy: "user",
        contextSnapshot: {
          fromStatus: bundle.status,
          toStatus: "ACTIVE",
          version: bundle.version,
          canaryPercent: bundle.canaryPercent,
        },
      })
      preAuditId = entry.auditId

      // 6. 自动化授权分级门禁（统一防线，与 proposals/[id]/rollback 同款）
      const gate = await checkAutomationGate({
        automationLevel: "L3",
        riskLevel: "high",
        confirmed: body.confirmationToken === L3_CONFIRMATION_TOKEN,
        actionName: "激活",
      })
      if (!gate.ok) {
        await updateAuditEntry({
          auditId: preAuditId,
          status: "failed",
          detail: `bundle ${bundleId} · 门禁拒绝：${gate.level}`,
        })
        return gate.response
      }

      // 7. 业务事务
      const now = new Date()
      await prisma.$transaction(async (tx) => {
        // 7.1 pre-activation 快照
        await createBundleSnapshot(bundleId, actor, "pre-activation", tx)

        // 7.2 同 workspace 其他 ACTIVE bundle → DEPRECATED
        await tx.harnessBundle.updateMany({
          where: {
            workspaceId: ctx.workspaceId,
            status: "ACTIVE",
            bundleId: { not: bundleId },
          },
          data: {
            status: "DEPRECATED",
            deprecatedAt: now,
          },
        })

        // 7.3 当前 bundle → ACTIVE
        await tx.harnessBundle.update({
          where: { bundleId },
          data: {
            status: "ACTIVE",
            canaryPercent: 100,
            activatedAt: now,
          },
        })

        // 7.4 关联的 approved 提案 → activated（与现有 status 字符串约定一致）
        await tx.harnessProposal.updateMany({
          where: {
            bundleId,
            status: "approved",
          },
          data: { status: "activated" },
        })
      })

      // 8. 更新预记录为 success
      await updateAuditEntry({
        auditId: preAuditId,
        status: "success",
        detail: `bundle ${bundleId} 已激活`,
        contextSnapshot: {
          activatedAt: now.toISOString(),
          gateLevel: gate.level,
        },
      })

      // 9. 持久化幂等键
      if (idempotencyKey) {
        await storeIdempotencyKey({
          workspaceId: ctx.workspaceId,
          key: idempotencyKey,
          taskId: bundleId,
          scope: "/api/harness/bundles/activate",
        })
      }

      logger.info("POST /api/harness/bundles/[bundleId]/activate 成功", {
        bundleId,
        actor,
      })

      return ApiResponse.ok({
        bundleId,
        status: "ACTIVE",
        activatedAt: now.toISOString(),
      })
    } catch (error) {
      logger.error("POST /api/harness/bundles/[bundleId]/activate 失败", {
        error: error instanceof Error ? error.message : "未知错误",
      })

      if (preAuditId) {
        await updateAuditEntry({
          auditId: preAuditId,
          status: "failed",
          detail: `激活异常: ${
            error instanceof Error ? error.message : "未知错误"
          }`,
        }).catch(() => {})
      }

      return ApiResponse.error("服务器内部错误", 500)
    }
  },
  "ADMIN",
)
