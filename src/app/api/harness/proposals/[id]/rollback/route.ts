/**
 * POST /api/harness/proposals/[id]/rollback
 * —— Harness 升级提案一键回滚接口（治理层）
 *
 * 遵循 AGENTS.md §4.5 安全护栏 + §4.7 自动化授权分级 + §4.11 RBAC：
 * - RBAC: 仅 ADMIN/OWNER（withRBAC），VIEWER/MEMBER 返回 403
 * - L4 动作的 rollback 硬拒绝（403）
 * - L3 须显式二次确认（confirmationToken 须与预期值匹配），缺失或错误则 409
 *
 * —— AGENTS.md §5 #3 禁止静默执行：回滚前写入预记录审计，事务完成/失败后更新状态。
 *
 * 回滚操作在 Prisma 事务中完成，任一步骤失败即整体回滚。
 */

import { prisma } from "@/lib/prisma"
import { ApiResponse } from "@/lib/server/api-response"
import { logger } from "@/lib/logger"
import {
  rollbackHarnessProposal,
  RollbackException,
} from "@/lib/server/harness/harness-rollback"
import { checkAutomationGate } from "@/lib/server/guardrail"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { z } from "zod"
import { validateBody } from "@/lib/server/validators"

// ==============================
// 请求体 Schema
// ==============================
const RollbackRequestSchema = z.object({
  operatorId: z.string().min(1, "operatorId 不能为空"),
  confirmationToken: z.string().optional(),
})

// ==============================
// 频率限制（基于 AuditLog DB 计数，支持多实例部署环境）
// ==============================

/** 同一 proposalId 回滚的最小间隔（秒） */
const ROLLBACK_COOLDOWN_SEC = 60
/** 全局回滚操作的滑动窗口（秒） */
const GLOBAL_WINDOW_SEC = 60
/** 全局窗口内最大回滚次数 */
const GLOBAL_MAX_ROLLBACKS = 3

/**
 * 基于 AuditLog 的分布式频率限制（取代 in-memory Map）
 * 查询最近 ROLLBACK_COOLDOWN_SEC 秒内对指定 proposalId 的成功回滚次数，
 * 以及全局 GLOBAL_WINDOW_SEC 秒内的成功回滚次数。
 * 返回 null 表示通过；返回 Response 表示被限流。
 */
async function checkRateLimit(proposalId: string, workspaceId: string): Promise<Response | null> {
  const now = new Date()
  const cooldownThreshold = new Date(now.getTime() - ROLLBACK_COOLDOWN_SEC * 1000)
  const globalThreshold = new Date(now.getTime() - GLOBAL_WINDOW_SEC * 1000)

  // 全局窗口限制：查询最近一分钟内 workspace 的所有成功回滚次数
  const globalCount = await prisma.auditLog.count({
    where: {
      workspaceId,
      action: "rollback.proposal",
      status: "success",
      createdAt: { gte: globalThreshold },
    },
  })

  if (globalCount >= GLOBAL_MAX_ROLLBACKS) {
    return ApiResponse.error(
      `回滚操作过于频繁（${GLOBAL_WINDOW_SEC}秒内最多 ${GLOBAL_MAX_ROLLBACKS} 次），请稍后再试`,
      429,
    )
  }

  // 单提案冷却：查询该提案最近一次成功回滚
  const lastRollback = await prisma.auditLog.findFirst({
    where: {
      targetId: proposalId,
      action: "rollback.proposal",
      status: "success",
      createdAt: { gte: cooldownThreshold },
    },
    orderBy: { createdAt: "desc" },
  })

  if (lastRollback) {
    const elapsed = Math.floor((now.getTime() - lastRollback.createdAt.getTime()) / 1000)
    const remaining = ROLLBACK_COOLDOWN_SEC - elapsed
    return ApiResponse.error(
      `该提案刚刚执行过回滚，请等待 ${remaining} 秒后再试`,
      429,
    )
  }

  return null
}

// ==============================
// L3 确认 Token 校验
// ==============================

/** L3 二次确认的预期 Token（开发阶段；生产环境应从环境变量获取） */
const L3_CONFIRMATION_TOKEN =
  process.env["HARNESS_L3_CONFIRMATION_TOKEN"] ?? "确认回滚"

/**
 * 校验 L3 confirmationToken 是否与预期值匹配。
 * 返回 null 表示通过；返回 Response 表示校验失败。
 */
function validateL3Confirmation(confirmationToken: string | undefined): Response | null {
  if (!confirmationToken || confirmationToken !== L3_CONFIRMATION_TOKEN) {
    return Response.json(
      {
        success: false,
        error:
          "L3 高风险回滚操作，确认后将立即恢复 Agent 的任务边界与工具访问且无法撤销，请提供有效的 confirmationToken 二次确认",
        requiresConfirmation: true,
      },
      { status: 409 },
    )
  }
  return null
}

// ==============================
// POST Handler
// ==============================

/**
 * POST /api/harness/proposals/[id]/rollback
 *
 * 对已批准的 Harness 升级提案执行一键回滚：
 * - 恢复关联 Agent 的 taskBoundary（canDo / cannotDo）
 * - 恢复关联 Agent 的 toolAccess（bindConnectors / bindSkills）
 * - 写入 AuditLog（riskLevel = high）+ AgentLog
 *
 * 安全约束（AGENTS.md §4.7 + §4.11）：
 * - RBAC: 仅 ADMIN/OWNER，VIEWER/MEMBER 返回 403
 * - L4 提案：硬拒绝 403（绝对禁止自动，审批通道亦不得放行）
 * - L3 提案：必须提供有效的 confirmationToken，缺失或错误则 409
 * - 频率限制：同一提案 60s 冷却 + 全局每分钟最多 3 次
 *
 * —— AGENTS.md §5 #3 禁止静默执行：回滚前写入预记录，事务完成后更新状态。
 */
export const POST = withRBAC(
  async (
    req: Request,
    ctx: WorkspaceContext,
    routeCtx: RouteContext<{ id: string }>,
  ) => {
    // 用于预记录审计的 auditId（在事务前置步骤获取 proposal 信息后再写入）
    let preAuditId: string | null = null

    try {
      const { id } = await routeCtx.params

      // 1. 频率限制（基于 AuditLog DB 计数，支持多实例部署）
      const rateError = await checkRateLimit(id, ctx.workspaceId)
      if (rateError) return rateError

      // 2. 解析并校验请求体
      let body: z.infer<typeof RollbackRequestSchema>
      try {
        const rawBody = await req.json()
        const parsed = validateBody(rawBody, RollbackRequestSchema)
        if (parsed instanceof Response) return parsed
        body = parsed
      } catch {
        return ApiResponse.error("请求体格式无效，须为合法 JSON", 400)
      }

      // 3. 查找提案元数据（取门禁 + 快照所需字段）
      //    workspaceId 隔离（AGENTS.md §4.11）
      const proposal = await prisma.harnessProposal.findUnique({
        where: { id, workspaceId: ctx.workspaceId },
        select: {
          id: true,
          proposalId: true,
          status: true,
          proposedChange: true,
          previousSnapshot: true,
          workspaceId: true,
        },
      })

      if (!proposal) {
        return ApiResponse.error("提案不存在", 404)
      }

      // automationLevel / riskLevel 嵌套在 proposedChange JSON 内（非顶层列）
      const propChange = (proposal.proposedChange ?? {}) as {
        automationLevel?: string
        riskLevel?: string
      }
      const automationLevelRaw = propChange.automationLevel ?? null
      const riskLevelRaw = propChange.riskLevel ?? "high"

      // 4. AGENTS.md §5 #3 禁止静默执行：回滚前写入预记录审计
      const actor = await actorFromSession()
      const entry = await createAuditEntry({
        actor,
        action: "rollback.proposal",
        targetType: "proposal",
        targetId: id,
        detail: `${proposal.proposalId} · 操作者 ${body.operatorId}`,
        riskLevel: "high",
        workspaceId: proposal.workspaceId,
        automationLevel: (automationLevelRaw as "L1" | "L2" | "L3" | "L4") ?? undefined,
        triggeredBy: "user",
        contextSnapshot: {
          proposalId: proposal.proposalId,
          hepStatus: proposal.status,
          riskLevel: riskLevelRaw,
          automationLevel: automationLevelRaw,
          operatorId: body.operatorId,
          previousSnapshot: proposal.previousSnapshot
            ? JSON.parse(proposal.previousSnapshot)
            : null,
        },
      })
      preAuditId = entry.auditId

      // 5. 自动化授权分级门禁（AGENTS.md §4.7）—— 使用共享护栏函数
      const gateResult = await checkAutomationGate({
        automationLevel: automationLevelRaw,
        riskLevel: riskLevelRaw,
        confirmed: body.confirmationToken === L3_CONFIRMATION_TOKEN,
        actionName: "回滚",
      })
      if (!gateResult.ok) {
        // 门禁拒绝 → 更新预记录为 failed
        await updateAuditEntry({
          auditId: preAuditId,
          status: "failed",
          detail: `${proposal.proposalId} · 门禁拒绝：${gateResult.level}`,
        })
        return gateResult.response
      }

      // 6. L3 确认 Token 额外显式校验（双保险：gate 判断 confirmed 状态，此处校验 Token 匹配）
      //    确保 confirmed 状态与 Token 真实匹配，防止调用方绕过
      if (automationLevelRaw === "L3") {
        const confirmationError = validateL3Confirmation(body.confirmationToken)
        if (confirmationError) {
          await updateAuditEntry({
            auditId: preAuditId,
            status: "failed",
            detail: `${proposal.proposalId} · L3 确认 Token 校验失败`,
          })
          return confirmationError
        }
      }

      // 7. 执行回滚（全程 Prisma 事务，失败即整体回滚）
      //    审计日志的最终写入在 harness-rollback.ts 的事务内完成（强一致性），
      //    此处路由层仅更新预记录状态。
      const result = await rollbackHarnessProposal(id, body.operatorId)

      // 事务成功 → 更新预记录为 success
      await updateAuditEntry({
        auditId: preAuditId,
        status: "success",
        detail: `${result.hepId} · 回滚 Agent ${result.agentId} 至快照版本`,
        contextSnapshot: {
          result,
          gateLevel: gateResult.level,
          completedAt: new Date().toISOString(),
        },
      })

      logger.info("POST /api/harness/proposals/[id]/rollback 成功", {
        proposalId: result.proposalId,
        hepId: result.hepId,
        agentId: result.agentId,
        operatorId: result.operatorId,
        gateResult,
      })

      return ApiResponse.ok(result)
    } catch (error) {
      // RollbackException 是已知的业务异常，返回其携带的状态码
      if (error instanceof RollbackException) {
        // 事务失败 → 更新预记录为 failed
        if (preAuditId) {
          await updateAuditEntry({
            auditId: preAuditId,
            status: "failed",
            detail: `回滚失败: ${error.message}`,
          }).catch(() => {})
        }
        return ApiResponse.error(error.message, error.status)
      }

      logger.error("POST /api/harness/proposals/[id]/rollback 失败", {
        error: error instanceof Error ? error.message : "未知错误",
      })

      // 未知异常 → 更新预记录为 failed
      if (preAuditId) {
        await updateAuditEntry({
          auditId: preAuditId,
          status: "failed",
          detail: `回滚异常: ${error instanceof Error ? error.message : "未知错误"}`,
        }).catch(() => {})
      }

      return ApiResponse.error("服务器内部错误", 500)
    }
  },
  "ADMIN",
)
