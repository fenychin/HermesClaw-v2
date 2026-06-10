/**
 * POST /api/harness/proposals/[id]/rollback
 * —— Harness 升级提案一键回滚接口（治理层）
 *
 * 遵循 AGENTS.md §4.5 安全护栏 + §4.7 自动化授权分级：
 * - L4 动作的 rollback 硬拒绝（403）
 * - L3 须显式二次确认（confirmationToken 须与预期值匹配），缺失或错误则 409
 * - 所有操作须校验 approvalToken 请求头
 *
 * —— AGENTS.md §5 #3 禁止静默执行：回滚前写入预记录审计，事务完成/失败后更新状态。
 *
 * 回滚操作在 Prisma 事务中完成，任一步骤失败即整体回滚。
 */

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { ApiResponse } from "@/lib/server/api-response"
import { logger } from "@/lib/logger"
import {
  rollbackHarnessProposal,
  RollbackException,
} from "@/lib/server/harness/harness-rollback"
import { checkAutomationGate } from "@/lib/server/guardrail"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { z } from "zod"
import { validateBody } from "@/lib/validators"

// ==============================
// 请求体校验 Schema
// ==============================

const RollbackRequestSchema = z.object({
  /** L3 二次确认 Token（L3 操作必须提供，且须与预期值匹配） */
  confirmationToken: z.string().optional(),
  /** 操作者标识（用户邮箱 / 用户名） */
  operatorId: z.string().min(1).max(100),
})

// ==============================
// 请求头校验
// ==============================

/** 固定的审批 Token（开发阶段；生产环境应从环境变量或密钥管理服务获取） */
const APPROVAL_TOKEN =
  process.env["HARNESS_APPROVAL_TOKEN"] ?? "harness-rollback-dev-token"

/**
 * 校验请求头中的 approvalToken
 * 失败时返回 401 响应，成功时返回 null
 */
function validateApprovalToken(req: NextRequest): Response | null {
  const token = req.headers.get("x-approval-token") ?? req.headers.get("approval-token")

  if (!token || token !== APPROVAL_TOKEN) {
    return ApiResponse.error("缺少有效的审批 Token（x-approval-token）", 401)
  }

  return null
}

// ==============================
// 频率限制（简单 in-memory，高危操作防滥用）
// ==============================

/** 同一 proposalId 回滚的最小间隔（毫秒） */
const ROLLBACK_COOLDOWN_MS = 60_000
/** 全局回滚操作的滑动窗口（毫秒） */
const GLOBAL_WINDOW_MS = 60_000
/** 全局窗口内最大回滚次数 */
const GLOBAL_MAX_ROLLBACKS = 3

const rollbackTimestamps = new Map<string, number[]>()
const globalTimestamps: number[] = []

/**
 * 简单 in-memory 频率限制：清理过期记录 → 检查窗口内计数。
 * 返回 null 表示通过；返回 Response 表示被限流。
 */
function checkRateLimit(proposalId: string): Response | null {
  const now = Date.now()

  // 清理全局过期记录
  while (globalTimestamps.length > 0 && globalTimestamps[0] < now - GLOBAL_WINDOW_MS) {
    globalTimestamps.shift()
  }

  // 全局限制
  if (globalTimestamps.length >= GLOBAL_MAX_ROLLBACKS) {
    return ApiResponse.error("回滚操作过于频繁，请稍后再试", 429)
  }

  // 单提案冷却
  const history = rollbackTimestamps.get(proposalId) ?? []
  const last = history[history.length - 1]
  if (last && now - last < ROLLBACK_COOLDOWN_MS) {
    return ApiResponse.error(
      `该提案刚刚执行过回滚，请等待 ${Math.ceil((ROLLBACK_COOLDOWN_MS - (now - last)) / 1000)} 秒后再试`,
      429,
    )
  }

  return null
}

/** 记录一次回滚操作 */
function recordRollback(proposalId: string): void {
  const now = Date.now()
  const history = rollbackTimestamps.get(proposalId) ?? []
  history.push(now)
  // 仅保留最近 5 条，防内存泄漏
  if (history.length > 5) history.shift()
  rollbackTimestamps.set(proposalId, history)
  globalTimestamps.push(now)
  // 全局限流也仅保留最近记录
  if (globalTimestamps.length > GLOBAL_MAX_ROLLBACKS * 2) {
    globalTimestamps.splice(0, globalTimestamps.length - GLOBAL_MAX_ROLLBACKS * 2)
  }
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
 * 安全约束（AGENTS.md §4.7）：
 * - L4 提案：硬拒绝 403（绝对禁止自动，审批通道亦不得放行）
 * - L3 提案：必须提供有效的 confirmationToken，缺失或错误则 409
 * - 所有请求：必须携带有效的 approvalToken 请求头
 * - 频率限制：同一提案 60s 冷却 + 全局每分钟最多 3 次
 *
 * —— AGENTS.md §5 #3 禁止静默执行：回滚前写入预记录，事务完成后更新状态。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 用于预记录审计的 auditId（在事务前置步骤获取 proposal 信息后再写入）
  let preAuditId: string | null = null

  try {
    const { id } = await params

    // 0. 校验审批 Token
    const tokenError = validateApprovalToken(req)
    if (tokenError) return tokenError

    // 1. 频率限制
    const rateError = checkRateLimit(id)
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
    const proposal = await prisma.harnessProposal.findUnique({
      where: { id },
      select: {
        id: true,
        proposalId: true,
        status: true,
        automationLevel: true,
        riskLevel: true,
        previousSnapshot: true,
        workspaceId: true,
      },
    })

    if (!proposal) {
      return ApiResponse.error("提案不存在", 404)
    }

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
      automationLevel: (proposal.automationLevel as "L1" | "L2" | "L3" | "L4") ?? undefined,
      triggeredBy: "user",
      contextSnapshot: {
        proposalId: proposal.proposalId,
        hepStatus: proposal.status,
        riskLevel: proposal.riskLevel,
        automationLevel: proposal.automationLevel,
        operatorId: body.operatorId,
        previousSnapshot: proposal.previousSnapshot
          ? JSON.parse(proposal.previousSnapshot)
          : null,
      },
    })
    preAuditId = entry.auditId

    // 5. 自动化授权分级门禁（AGENTS.md §4.7）—— 使用共享护栏函数
    const gateResult = await checkAutomationGate({
      automationLevel: proposal.automationLevel,
      riskLevel: proposal.riskLevel,
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
    const confirmationError = validateL3Confirmation(body.confirmationToken)
    if (confirmationError) {
      await updateAuditEntry({
        auditId: preAuditId,
        status: "failed",
        detail: `${proposal.proposalId} · L3 确认 Token 校验失败`,
      })
      return confirmationError
    }

    // 7. 记录频率限制
    recordRollback(id)

    // 8. 执行回滚（全程 Prisma 事务，失败即整体回滚）
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
}
