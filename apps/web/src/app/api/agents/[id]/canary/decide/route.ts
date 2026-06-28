/**
 * POST /api/agents/[id]/canary/decide — 审批或拒绝 Canary 灰度发布
 *
 * 三域归属：Hermes 控制核 — Canary 生命周期决策
 *
 * 输入：canaryId、decision (approve|reject)、reason?、confirm?
 * 输出：{ decision, canaryStatus }
 *
 * 审计点：canary.approve / canary.reject（二阶段）
 * 审批点：L3 门禁检查（Canary 决策始终视为高风险）
 */
import { prisma } from "@/lib/prisma"
import { ApiResponse } from "@/lib/server/api-response"
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { checkAutomationGate } from "@/lib/server/guardrail"
import { promoteCanary, abortCanary, CanaryNotFoundError, CanaryInvalidStateError } from "@/lib/server/canary"
import { logger } from "@/lib/logger"

// ==============================
// 输入校验
// ==============================

const VALID_DECISIONS = ["approve", "reject"] as const

function validateBody(body: unknown): {
  ok: true
  data: { canaryId: string; decision: "approve" | "reject"; reason: string; confirm: boolean }
} | {
  ok: false
  response: Response
} {
  if (!body || typeof body !== "object") {
    return { ok: false, response: ApiResponse.error("请求体不能为空", 400) }
  }
  const b = body as Record<string, unknown>

  const canaryId = b.canaryId
  if (typeof canaryId !== "string" || canaryId.trim().length === 0) {
    return { ok: false, response: ApiResponse.error("canaryId 不能为空", 400) }
  }

  const decision = b.decision
  if (
    typeof decision !== "string" ||
    !(VALID_DECISIONS as readonly string[]).includes(decision)
  ) {
    return {
      ok: false,
      response: ApiResponse.error("decision 必须是 approve 或 reject", 400),
    }
  }

  const reason =
    typeof b.reason === "string" && b.reason.trim().length > 0
      ? b.reason.trim()
      : decision === "approve"
        ? "人工批准灰度发布"
        : "人工拒绝灰度发布"

  const confirm = b.confirm === true

  return {
    ok: true,
    data: { canaryId: canaryId.trim(), decision: decision as "approve" | "reject", reason, confirm },
  }
}

// ==============================
// Route Handler
// ==============================

export const POST = withRBAC(
  async (
    req: Request,
    ctx: WorkspaceContext,
    routeCtx: RouteContext<{ id: string }>,
  ) => {
    try {
      const { id: agentId } = await routeCtx.params

      // 1. 验证 Agent 存在
      const agent = await prisma.agent.findUnique({
        where: { id: agentId, workspaceId: ctx.workspaceId },
      })
      if (!agent) {
        return ApiResponse.error("智能体不存在", 404)
      }

      // 2. 解析并校验 body
      let body: unknown
      try { body = await req.json() } catch {
        return ApiResponse.error("请求体 JSON 解析失败", 400)
      }
      const parsed = validateBody(body)
      if (!parsed.ok) return parsed.response
      const { canaryId, decision, reason, confirm } = parsed.data

      // 3. 验证 Canary 存在且归属正确
      const canary = await prisma.harnessCanary.findUnique({
        where: { canaryId },
      })
      if (!canary) {
        return ApiResponse.error(`Canary 不存在: ${canaryId}`, 404)
      }
      if (canary.agentId !== agentId) {
        return ApiResponse.error(`Canary ${canaryId} 不属于智能体 ${agentId}`, 403)
      }
      if (canary.workspaceId !== ctx.workspaceId) {
        return ApiResponse.error(`Canary ${canaryId} 不属于当前工作空间`, 403)
      }

      // 4. 门禁检查（Canary 审批视为 L3 / high risk）
      const gate = await checkAutomationGate({
        automationLevel: "L3",
        riskLevel: "high",
        confirmed: confirm,
        actionName: decision === "approve" ? "批准 Canary 灰度" : "拒绝 Canary 灰度",
      })
      if (!gate.ok) return gate.response

      // 5. 二阶段审计：预记录
      const auditAction = decision === "approve" ? "canary.approve" : "canary.reject"
      const auditEntry = await createAuditEntry({
        actor: gate.actor,
        action: auditAction,
        targetType: "canary",
        targetId: canaryId,
        detail: `${decision === "approve" ? "批准" : "拒绝"} Canary ${canaryId}，原因: ${reason}`,
        riskLevel: "high",
        workspaceId: ctx.workspaceId,
        automationLevel: "L3",
        triggeredBy: "user",
        contextSnapshot: { canaryId, decision, reason, agentId },
      })

      // 6. 执行审批/拒绝
      try {
        if (decision === "approve") {
          await promoteCanary(canaryId, gate.actor)
        } else {
          await abortCanary(canaryId, reason, gate.actor)
        }
      } catch (execErr) {
        await updateAuditEntry({
          auditId: auditEntry.auditId,
          status: "failed",
          detail: `Canary 决策执行失败: ${execErr instanceof Error ? execErr.message : "未知错误"}`,
        })
        if (execErr instanceof CanaryNotFoundError) {
          return ApiResponse.error(execErr.message, 404)
        }
        if (execErr instanceof CanaryInvalidStateError) {
          return ApiResponse.error(execErr.message, 409)
        }
        throw execErr
      }

      // 7. 审计：成功
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "success",
        detail: `Canary ${canaryId} 已${decision === "approve" ? "批准（晋级）" : "拒绝（回滚）"}`,
      })

      return ApiResponse.ok({
        decision,
        canaryStatus: decision === "approve" ? "promoted" : "rolling-back",
        message:
          decision === "approve"
            ? `Canary ${canaryId} 已批准晋级，提案将激活`
            : `Canary ${canaryId} 已拒绝，提案将回滚`,
      })
    } catch (error) {
      logger.error("POST /api/agents/[id]/canary/decide: 失败", {
        error: error instanceof Error ? error.message : "未知错误",
      })
      return ApiResponse.error(
        error instanceof Error ? error.message : "Canary 决策失败",
        500,
      )
    }
  },
  "ADMIN",
)
