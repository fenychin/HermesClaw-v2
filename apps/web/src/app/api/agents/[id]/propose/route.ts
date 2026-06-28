/**
 * POST /api/agents/[id]/propose — 触发自动化等级升级提案
 *
 * 三域归属：Hermes 控制核 — HarnessProposal 生命周期
 *
 * 输入：targetAutomationLevel (L1-L4)、reason、confirm（L3+ 必填）
 * 输出：proposalId（HEP-{timestamp}）
 *
 * 审计点：agent.propose（二阶段：pending → success/failed）
 * 审批点：L3/L4 变更自动创建 ApprovalCheckpoint
 * 门禁：L4 硬阻止 403 / L3 需 confirm 409
 */
import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { ApiResponse } from "@/lib/server/api-response"
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { checkAutomationGate } from "@/lib/server/guardrail"
import { createApprovalCheckpoint } from "@/lib/server/approval"
import { mapAutomationToAuditRisk } from "@/types"
import { logger } from "@/lib/logger"

// ==============================
// 输入校验
// ==============================

const VALID_LEVELS = ["L1", "L2", "L3", "L4"] as const

function validateBody(body: unknown): {
  ok: true
  data: { targetAutomationLevel: string; reason: string; confirm: boolean }
} | {
  ok: false
  response: Response
} {
  if (!body || typeof body !== "object") {
    return { ok: false, response: ApiResponse.error("请求体不能为空", 400) }
  }
  const b = body as Record<string, unknown>

  const targetAutomationLevel = b.targetAutomationLevel
  if (
    typeof targetAutomationLevel !== "string" ||
    !(VALID_LEVELS as readonly string[]).includes(targetAutomationLevel)
  ) {
    return {
      ok: false,
      response: ApiResponse.error(
        `targetAutomationLevel 必须是 ${VALID_LEVELS.join(" / ")} 之一`,
        400,
      ),
    }
  }

  const reason = b.reason
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { ok: false, response: ApiResponse.error("reason 不能为空", 400) }
  }

  const confirm = b.confirm === true

  return { ok: true, data: { targetAutomationLevel, reason: reason.trim(), confirm } }
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
      const { targetAutomationLevel, reason, confirm } = parsed.data

      // 3. 不允许降级提案（仅支持升级或同级）
      const levelOrder = { L1: 0, L2: 1, L3: 2, L4: 3 }
      const currentOrder = levelOrder[agent.automationLevel as keyof typeof levelOrder] ?? 0
      const targetOrder = levelOrder[targetAutomationLevel as keyof typeof levelOrder] ?? 0
      if (targetOrder < currentOrder) {
        return ApiResponse.error(
          `不允许降级提案（当前 ${agent.automationLevel} → 目标 ${targetAutomationLevel}）。请使用回滚功能。`,
          400,
        )
      }
      if (targetOrder === currentOrder) {
        return ApiResponse.error(
          `目标等级 ${targetAutomationLevel} 与当前等级相同，无需提案`,
          400,
        )
      }

      // 4. 风险管理 — 推导 riskLevel
      const riskLevel =
        targetOrder >= 3
          ? "high"
          : targetOrder >= 2
            ? "medium"
            : "low"

      // 5. 自动化门禁
      const gate = await checkAutomationGate({
        automationLevel: targetAutomationLevel,
        riskLevel,
        confirmed: confirm,
        actionName: `升级自动化等级至 ${targetAutomationLevel}`,
      })
      if (!gate.ok) return gate.response

      // 6. 收集执行证据：查询该 Agent 最近 20 条 AgentLog，生成 evidence 数组
      const recentLogs = await prisma.agentLog.findMany({
        where: { agentId, workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { status: true, taskName: true, createdAt: true, workflowRunId: true },
      })

      const totalTasks = recentLogs.length
      const successCount = recentLogs.filter(
        (l) => l.status === "completed" || l.status === "success",
      ).length
      const failCount = recentLogs.filter(
        (l) => l.status === "failed" || l.status === "error",
      ).length
      const successRate =
        totalTasks > 0 ? `${((successCount / totalTasks) * 100).toFixed(1)}%` : "N/A"

      const evidence: string[] = [
        `执行记录: 最近 ${totalTasks} 次任务，成功 ${successCount} 次，失败 ${failCount} 次`,
        `成功率: ${successRate} (${successCount}/${totalTasks})`,
        `当前自动化等级: ${agent.automationLevel}`,
        `目标自动化等级: ${targetAutomationLevel}`,
      ]
      if (reason) evidence.push(`提案原因: ${reason}`)

      // 7. 二阶段审计：预记录
      const auditEntry = await createAuditEntry({
        actor: gate.actor,
        action: "agent.propose",
        targetType: "agent",
        targetId: agentId,
        detail: `升级提案: ${agent.automationLevel} → ${targetAutomationLevel}，原因: ${reason}`,
        riskLevel,
        workspaceId: ctx.workspaceId,
        automationLevel: targetAutomationLevel as Parameters<typeof createAuditEntry>[0]["automationLevel"],
        triggeredBy: "user",
        contextSnapshot: {
          previousLevel: agent.automationLevel,
          targetLevel: targetAutomationLevel,
          reason,
          successRate,
          totalRecentTasks: totalTasks,
          successCount,
          failCount,
        },
      })

      // 8. 生成 proposalId 并创建提案
      const proposalId = `HEP-${Date.now()}`
      const title = `升级智能体「${agent.name}」至 ${targetAutomationLevel}`

      let proposalDbId: string
      try {
        const created = await prisma.harnessProposal.create({
          data: {
            id: crypto.randomUUID(),
            proposalId,
            workspaceId: ctx.workspaceId,
            title,
            severity: riskLevel,
            proposalType: "eval_rule",
            triggeredBy: "manual",
            triggerReason: reason,
            problemStatement: `智能体 ${agent.name} 当前自动化等级为 ${agent.automationLevel}，申请升级至 ${targetAutomationLevel}。原因: ${reason}`,
            evidence,
            proposedChange: {
              targetComponent: "eval_rule",
              description: `将自动化等级从 ${agent.automationLevel} 升级至 ${targetAutomationLevel}`,
              automationLevel: targetAutomationLevel,
              riskLevel,
            },
            requiresHumanApproval: targetOrder >= 2,
            estimatedImpact: `变更自动化授权等级至 ${targetAutomationLevel}，影响该智能体所有后续任务的执行权限`,
            affectedAgents: JSON.stringify([agentId]),
            rollbackPlan: "通过 Harness 快照一键回滚至变更前状态",
            status: targetOrder >= 2 ? "pending" : "approved",
            previousSnapshot: JSON.stringify({
              agentId: agent.id,
              automationLevel: agent.automationLevel,
              harnessVersion: agent.harnessVersion,
            }),
            signalSnapshot: JSON.stringify({}),
          },
        })
        proposalDbId = created.id
      } catch (createErr) {
        await updateAuditEntry({
          auditId: auditEntry.auditId,
          status: "failed",
          detail: `创建提案失败: ${createErr instanceof Error ? createErr.message : "未知错误"}`,
        })
        throw createErr
      }

      // 9. L3/L4 变更自动创建 ApprovalCheckpoint
      if (targetOrder >= 2) {
        try {
          await createApprovalCheckpoint({
            proposalId: proposalDbId,
            workspaceId: ctx.workspaceId,
            triggerReason: "automation.level.l3_l4",
            riskLevel,
            automationLevel: targetAutomationLevel as Parameters<typeof createApprovalCheckpoint>[0]["automationLevel"],
            actionSummary: title,
            inputSnapshot: {
              agentId,
              agentName: agent.name,
              currentLevel: agent.automationLevel,
              targetLevel: targetAutomationLevel,
              reason,
            },
            policySnapshotVersion: agent.harnessVersion ?? "v1.0.0",
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72h
            creator: gate.actor,
          })
        } catch (cpErr) {
          logger.error("POST /api/agents/[id]/propose: 创建审批检查点失败", {
            error: cpErr instanceof Error ? cpErr.message : "未知错误",
          })
          // 不阻断主流程——提案已创建，审批检查点可后续补建
        }
      }

      // 9. 审计：成功
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "success",
        detail: `提案已创建: ${proposalId}`,
      })

      return ApiResponse.ok({
        proposalId,
        status: targetOrder >= 2 ? "pending" : "approved",
        message:
          targetOrder >= 2
            ? `升级提案已提交，待审批（ID: ${proposalId}）`
            : `升级提案已自动批准（ID: ${proposalId}）`,
      })
    } catch (error) {
      logger.error("POST /api/agents/[id]/propose: 失败", {
        error: error instanceof Error ? error.message : "未知错误",
      })
      return ApiResponse.error(
        error instanceof Error ? error.message : "触发提案失败",
        500,
      )
    }
  },
  "MEMBER",
)
