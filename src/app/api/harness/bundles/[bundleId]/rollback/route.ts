/**
 * POST /api/harness/bundles/[bundleId]/rollback
 *
 * 将 HarnessBundle 回滚到指定快照（不传 snapshotId 则取最近一条），
 * 状态转为 ROLLED_BACK，canaryPercent 归零（CLAUDE.md §4.5 / §8.1）。
 *
 * 治理护栏（与 activate 同款，AGENTS.md §4.7 + §4.11）：
 * - RBAC: 仅 ADMIN/OWNER（withRBAC）
 * - L3 二次确认（confirmationToken 必须匹配）
 * - 必填 reason（强制审计可追溯）
 * - 幂等：Idempotency-Key 命中直接返回
 * - 预记录审计两段式
 *
 * 错误映射：
 * - 空 reason            → 400 ROLLBACK_REASON_REQUIRED（zod 校验）
 * - bundle 不存在/越权    → 404
 * - 无可用快照            → 422 NO_SNAPSHOT
 * - 指定 snapshotId 不存在 → 404 SNAPSHOT_NOT_FOUND
 * - 当前状态不能 → ROLLED_BACK（如 DRAFT/ROLLED_BACK） → 409 INVALID_TRANSITION
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
import { InvalidTransitionError } from "@/lib/server/harness/bundle-state-machine"
import {
  rollbackBundleToSnapshot,
  NoSnapshotAvailableError,
  SnapshotNotFoundError,
} from "@/lib/server/harness/bundle-snapshot"
import type { WorkspaceContext } from "@/lib/workspace"

// ==============================
// 请求体 Schema
// ==============================

const RollbackRequestSchema = z.object({
  /** 指定快照 ID；不传则回滚到最近一条 */
  snapshotId: z.string().optional(),
  /** 必填回滚原因（强制审计可追溯） */
  reason: z
    .string()
    .trim()
    .min(1, "ROLLBACK_REASON_REQUIRED: 回滚必须填写原因，确保审计可追溯"),
  /** L3 二次确认 Token */
  confirmationToken: z.string().optional(),
})

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
            rolledBackAt: hit.createdAt.toISOString(),
          })
        }
      }

      // 2. 解析请求体（zod 校验空 reason → 400）
      let body: z.infer<typeof RollbackRequestSchema>
      try {
        const raw = await req.json()
        const parsed = validateBody(raw, RollbackRequestSchema)
        if (parsed instanceof Response) return parsed
        body = parsed
      } catch {
        return ApiResponse.error("请求体格式无效，须为合法 JSON", 400)
      }

      // 3. 校验 bundle 存在 & 工作区归属
      const bundle = await prisma.harnessBundle.findUnique({
        where: { bundleId },
      })
      if (!bundle || bundle.workspaceId !== ctx.workspaceId) {
        return ApiResponse.error("Bundle 不存在", 404)
      }

      // 4. 预记录审计
      const actor = await actorFromSession()
      const entry = await createAuditEntry({
        actor,
        action: "harness.bundle.rollback",
        targetType: "harness_bundle",
        targetId: bundleId,
        detail: `${bundleId} · 原因：${body.reason}`,
        riskLevel: "high",
        workspaceId: ctx.workspaceId,
        automationLevel: "L3",
        triggeredBy: "user",
        contextSnapshot: {
          fromStatus: bundle.status,
          toStatus: "ROLLED_BACK",
          version: bundle.version,
          targetSnapshotId: body.snapshotId ?? null,
          reason: body.reason,
        },
      })
      preAuditId = entry.auditId

      // 5. L3 门禁
      const gate = await checkAutomationGate({
        automationLevel: "L3",
        riskLevel: "high",
        confirmed: body.confirmationToken === L3_CONFIRMATION_TOKEN,
        actionName: "回滚",
      })
      if (!gate.ok) {
        await updateAuditEntry({
          auditId: preAuditId,
          status: "failed",
          detail: `bundle ${bundleId} · 门禁拒绝：${gate.level}`,
        })
        return gate.response
      }

      // 6. 执行回滚（领域工具内做事务 + 状态机校验）
      let result: { snapshotId: string; restoredVersion: string }
      try {
        result = await rollbackBundleToSnapshot(bundleId, actor, {
          snapshotId: body.snapshotId,
        })
      } catch (e) {
        if (e instanceof NoSnapshotAvailableError) {
          await updateAuditEntry({
            auditId: preAuditId,
            status: "failed",
            detail: `bundle ${bundleId} · ${e.message}`,
          })
          return Response.json(
            { success: false, error: "NO_SNAPSHOT", message: e.message },
            { status: 422 },
          )
        }
        if (e instanceof SnapshotNotFoundError) {
          await updateAuditEntry({
            auditId: preAuditId,
            status: "failed",
            detail: `bundle ${bundleId} · ${e.message}`,
          })
          return Response.json(
            { success: false, error: "SNAPSHOT_NOT_FOUND", message: e.message },
            { status: 404 },
          )
        }
        if (e instanceof InvalidTransitionError) {
          await updateAuditEntry({
            auditId: preAuditId,
            status: "failed",
            detail: `bundle ${bundleId} · ${e.message}`,
          })
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

      // 7. 关联提案标记为 rolled_back（与现有 status 字符串约定一致）
      await prisma.harnessProposal.updateMany({
        where: { bundleId, status: { in: ["approved", "activated"] } },
        data: { status: "rolled_back" },
      })

      // 8. 更新预记录为 success
      const rolledBackAt = new Date()
      await updateAuditEntry({
        auditId: preAuditId,
        status: "success",
        detail: `bundle ${bundleId} 已回滚至快照 ${result.snapshotId}（version=${result.restoredVersion}）`,
        contextSnapshot: {
          restoredSnapshotId: result.snapshotId,
          restoredVersion: result.restoredVersion,
          rolledBackAt: rolledBackAt.toISOString(),
          gateLevel: gate.level,
        },
      })

      // 9. 持久化幂等键
      if (idempotencyKey) {
        await storeIdempotencyKey({
          workspaceId: ctx.workspaceId,
          key: idempotencyKey,
          taskId: bundleId,
          scope: "/api/harness/bundles/rollback",
        })
      }

      logger.info("POST /api/harness/bundles/[bundleId]/rollback 成功", {
        bundleId,
        snapshotId: result.snapshotId,
        actor,
      })

      return ApiResponse.ok({
        bundleId,
        status: "ROLLED_BACK",
        snapshotId: result.snapshotId,
        restoredVersion: result.restoredVersion,
        rolledBackAt: rolledBackAt.toISOString(),
      })
    } catch (error) {
      logger.error("POST /api/harness/bundles/[bundleId]/rollback 失败", {
        error: error instanceof Error ? error.message : "未知错误",
      })

      if (preAuditId) {
        await updateAuditEntry({
          auditId: preAuditId,
          status: "failed",
          detail: `回滚异常: ${
            error instanceof Error ? error.message : "未知错误"
          }`,
        }).catch(() => {})
      }

      return ApiResponse.error("服务器内部错误", 500)
    }
  },
  "ADMIN",
)
