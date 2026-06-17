import { NextRequest } from "next/server"; import { logger } from '@/lib/logger'
import { prisma } from "@/lib/prisma"; import { runHarnessEvaluation, EVAL_WINDOW_HOURS } from "@/lib/server/harness-eval"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { rollbackHarnessProposal } from "@/lib/server/harness/harness-rollback"; import { writeAuditLog } from "@/lib/server/audit"

export const runtime = "nodejs"; export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return errorResponse("未授权的定时任务调用", 401)
  try {
    const workspaces = await prisma.workspace.findMany({ select: { id: true } })
    let targetWorkspaces = workspaces.map(w => w.id)
    if (targetWorkspaces.length === 0) { const ws = process.env.DEFAULT_WORKSPACE_ID; if (ws) targetWorkspaces = [ws]; else targetWorkspaces = ["default"] }
    const results: Array<{ workspaceId: string; evaluations: number; anomalies: number }> = []
    for (const wsId of targetWorkspaces) {
      try {
        const proposals = await prisma.harnessProposal.findMany({ where: { workspaceId: wsId, status: "active" } })
        for (const p of proposals) { try { const metrics = await prisma.auditLog.count({ where: { workspaceId: wsId, action: { in: ["agent.boundary_violation", "EvalAnomalyDetected", "agent.execute.failed"] }, createdAt: { gte: new Date(Date.now() - EVAL_WINDOW_HOURS * 3600000) } } }); if (metrics > 0) { await rollbackHarnessProposal({ proposalId: p.id, operatorId: "cron", confirmed: true }); void writeAuditLog({ actor: "cron", action: "harness.rollback", targetType: "proposal", targetId: p.id, detail: `定时评估自动回滚: ${metrics} 项异常`, riskLevel: "high", workspaceId: wsId }).catch(() => {}) } } catch (rollbackErr) { logger.warn("Harness cron: 回滚提案失败", { proposalId: p.id, error: rollbackErr instanceof Error ? rollbackErr.message : "未知错误" }) } }
        const result = await runHarnessEvaluation(wsId); results.push({ workspaceId: wsId, ...result })
      } catch (evalErr) { logger.error("Harness cron: 评估工作空间失败", { workspaceId: wsId, error: evalErr instanceof Error ? evalErr.message : "未知错误" }); results.push({ workspaceId: wsId, evaluations: 0, anomalies: 1 }) }
    }
    const nextEvaluatedAt = new Date(Date.now() + 72 * 3600000).toISOString()
    return successResponse({ results, nextEvaluatedAt, evaluatedAt: new Date().toISOString() })
  } catch (error) { logger.error('Harness cron: 失败', { error: error instanceof Error ? error.message : '未知错误' }); return errorResponse(`定时评估失败: ${error instanceof Error ? error.message : "未知错误"}`) }
}
