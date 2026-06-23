/**
 * Phase 6 — 回滚演练脚本
 *
 * 模拟场景：
 *   A5 进化引擎生成的 proposal 激活后导致指标恶化，
 *   系统如何发现、告警、回滚、复位前端展示。
 *
 * 演练步骤：
 *   1. 准备：创建一个 approved proposal + snapshot
 *   2. 注入：启动 canary，写入劣化指标
 *   3. 检测：evaluateCanaryHealth 触发 Early Abort
 *   4. 回滚：executeRollback 原子恢复 Agent 状态
 *   5. 验证：检查四层日志证据链完整
 *
 * 使用方式：
 *   npx tsx scripts/rollback-drill.ts --workspace-id=ws-drill
 */
import { prisma } from "@/lib/prisma"
import { captureSnapshot } from "@/lib/server/harness-snapshot"
import { startCanary, evaluateCanaryHealth } from "@/lib/server/canary"
import { executeRollback } from "@/lib/server/rollback"
import { storeReceipt, getReceiptsByWorkflowRun } from "@/lib/server/receipt-store"
import { createAuditEntry, updateAuditEntry } from "@/lib/server/audit"
import { writeAgentLog } from "@/lib/server/agent-log"
import { logger } from "@/lib/logger"

interface DrillReport {
  step: string
  status: "pass" | "fail"
  detail: string
  evidence: Record<string, unknown>
}

const report: DrillReport[] = []

function record(step: string, status: "pass" | "fail", detail: string, evidence: Record<string, unknown> = {}) {
  report.push({ step, status, detail, evidence })
  const icon = status === "pass" ? "✓" : "✗"
  console.log(`  ${icon} ${step}: ${detail}`)
}

async function drill(workspaceId: string, agentId: string) {
  console.log(`\n🔧 回滚演练 — workspace: ${workspaceId}\n`)

  // ── Step 1: 准备 — 创建 Proposal + Snapshot ───────────────────────
  console.log("─ Step 1: 准备场景")

  const proposal = await prisma.harnessProposal.create({
    data: {
      id: `prop-drill-${Date.now()}`,
      proposalId: `HEP-DRILL-${Date.now()}`,
      workspaceId,
      triggeredBy: "manual",
      triggerReason: "回滚演练: A5 进化引擎生成",
      problemStatement: "雷达权重漂移，决策对齐度下降至 0.4",
      evidence: JSON.stringify(["agentlog: decisionAlignment=0.4"]),
      proposedChange: {
        targetComponent: "雷达权重",
        description: "A5 生成的权重优化",
        riskLevel: "high",
        automationLevel: "L2",
      } as any,
      estimatedImpact: "预期提升对齐度 20%",
      rollbackPlan: "回滚到 snapshot-drill 快照",
      status: "approved",
      approvedBy: "drill-admin",
      approvedAt: new Date(),
    },
  })

  // 记录初始 Agent 状态
  const originalAgent = await prisma.agent.findUnique({ where: { id: agentId } })
  if (!originalAgent) {
    record("准备 Agent", "fail", "Agent 不存在", { agentId })
    return report
  }

  const snapshot = await captureSnapshot({
    workspaceId,
    agentId,
    proposalId: proposal.id,
    snapshotType: "pre-canary",
    createdBy: "drill-admin",
    policySnapshotVersion: "v1.0-drill",
  })

  record("准备 Proposal", "pass", `创建 proposal: ${proposal.proposalId}`, {
    proposalId: proposal.proposalId,
    status: proposal.status,
  })
  record("准备 Snapshot", "pass", `创建快照: ${snapshot.snapshotId}`, {
    snapshotId: snapshot.snapshotId,
    agentName: (snapshot.agentConfig as any)?.name,
  })

  // ── Step 2: 注入 — 修改 Agent + 启动 Canary ───────────────────────
  console.log("\n─ Step 2: 注入变更")

  // 模拟 A5 修改了 Agent
  await prisma.agent.update({
    where: { id: agentId },
    data: {
      name: "DRILL-MODIFIED — 错误权重导致恶化",
      description: "A5 进化引擎自动修改的 Agent 配置",
      automationLevel: "L3",
    },
  })

  const canary = await startCanary({
    proposalId: proposal.id,
    workspaceId,
    agentId,
    snapshotId: snapshot.snapshotId,
    trafficPercent: 10,
    observationWindowMs: 2000, // 2s 观察窗口（演练加速）
    startedBy: "drill-admin",
  })

  record("注入 Agent 变更", "pass", "Agent 名称已修改为 DRILL-MODIFIED", {
    oldName: originalAgent.name,
    newName: "DRILL-MODIFIED — 错误权重导致恶化",
  })
  record("启动 Canary", "pass", `Canary: ${canary.canaryId}`, {
    canaryId: canary.canaryId,
    trafficPercent: 10,
  })

  // 写入劣化指标 — AgentLog + WorkflowRun + Receipt
  await writeAgentLog({
    workspaceId,
    agentId,
    source: "canary-eval",
    taskName: "evaluate-metrics",
    status: "running",
    duration: 0,
    detail: "Canary 指标恶化: decisionAlignment=0.35, errorRate=0.65",
    riskLevel: "high",
  })

  await prisma.workflowRun.create({
    data: {
      id: `run-drill-${Date.now()}`,
      workspaceId,
      workflowId: "wf-drill",
      agentId,
      status: "failed",
      nodeCount: 3,
      durationMs: 5000,
      errorMessage: "雷达权重偏离，决策对齐度 0.35 < 阈值 0.7",
      input: JSON.stringify({}),
      output: JSON.stringify({ error: "alignment degraded" }),
    },
  })

  await storeReceipt({
    receiptId: `rcpt-drill-${Date.now()}`,
    taskId: `task-drill-${Date.now()}`,
    workflowRunId: `run-drill-${Date.now()}`,
    connectorId: "conn-email",
    idempotencyKey: `idem-drill-${Date.now()}`,
    outcome: "failure",
    executedAt: new Date().toISOString(),
    errorCode: "ALIGNMENT_DEGRADED",
    compensationStrategy: "rollback-to-snapshot",
    workspaceId,
  })

  record("写入劣化证据", "pass", "AgentLog + WorkflowRun(failed) + Receipt(failure)", {
    agentLogRiskLevel: "high",
    workflowRunStatus: "failed",
    receiptOutcome: "failure",
  })

  // ── Step 3: 检测 — evaluateCanaryHealth 触发 Early Abort ──────────
  console.log("\n─ Step 3: 检测恶化")

  const evalResult = await evaluateCanaryHealth(workspaceId, {
    writeAuditLog: async (input) => {
      await prisma.auditLog.create({
        data: {
          actor: input.actor,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          detail: input.detail ?? null,
          riskLevel: input.riskLevel ?? null,
          workspaceId: input.workspaceId,
          status: "success",
        },
      })
    },
    getLatestMetrics: async () => ({
      errorRate: 0.65,
      successRate: 0.35,
      avgLatencyMs: 500,
      humanCorrectionRate: 0.0,
      connectorSuccessRate: 0.35,
    }),
    triggerRollback: async (canaryId, reason) => {
      await executeRollback(
        { canaryId, workspaceId, reason, triggerType: "auto", triggeredBy: "system" },
        {
          writeAuditLog: async (input) => {
            await prisma.auditLog.create({
              data: {
                actor: input.actor,
                action: input.action,
                targetType: input.targetType,
                targetId: input.targetId,
                detail: input.detail ?? null,
                riskLevel: input.riskLevel ?? null,
                workspaceId: input.workspaceId,
                status: "success",
              },
            })
          },
        }
      )
    },
  })

  record("健康评估", "pass", `earlyAborted=${evalResult.earlyAborted}`, evalResult)

  // ── Step 4: 验证 — 回滚完成 + Agent 复位 ─────────────────────────
  console.log("\n─ Step 4: 验证回滚")

  const updatedCanary = await prisma.harnessCanary.findUnique({
    where: { canaryId: canary.canaryId },
  })

  const canaryRolledBack = updatedCanary?.status === "rolled-back"
  record("Canary 状态", canaryRolledBack ? "pass" : "fail", `status=${updatedCanary?.status}`, {
    canaryStatus: updatedCanary?.status,
    rollbackReason: updatedCanary?.rollbackReason,
  })

  const restoredAgent = await prisma.agent.findUnique({ where: { id: agentId } })
  const agentRestored = restoredAgent?.name === originalAgent.name
  record("Agent 复位", agentRestored ? "pass" : "fail", `name=${restoredAgent?.name}`, {
    expected: originalAgent.name,
    actual: restoredAgent?.name,
  })

  const rollback = await prisma.harnessRollback.findFirst({
    where: { workspaceId, canaryId: canary.canaryId },
  })
  record("Rollback 记录", rollback ? "pass" : "fail", `status=${rollback?.status}`, {
    rollbackId: rollback?.rollbackId,
    status: rollback?.status,
    restoredFields: rollback?.restoredFields,
  })

  // ── Step 5: 审计证据链 ────────────────────────────────────────────
  console.log("\n─ Step 5: 审计证据链")

  const auditLogs = await prisma.auditLog.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: { action: true, status: true, createdAt: true },
  })

  const requiredActions = [
    "canary.started",
    "canary.aborted",
    "proposal.rollback",
  ]
  for (const action of requiredActions) {
    const found = auditLogs.some((a) => a.action === action)
    record(`审计: ${action}`, found ? "pass" : "fail", found ? "已记录" : "缺失")
  }

  const agentLogs = await prisma.agentLog.findMany({ where: { workspaceId } })
  record("AgentLog 证据", agentLogs.length > 0 ? "pass" : "fail", `${agentLogs.length} 条`)

  const rollbackAudits = await prisma.auditLog.findMany({
    where: { workspaceId, action: "proposal.rollback" },
  })
  record("回滚审计链", rollbackAudits.length > 0 ? "pass" : "fail", `${rollbackAudits.length} 条`)

  // ── 汇总 ──────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════")
  const total = report.length
  const passed = report.filter((r) => r.status === "pass").length
  const failed = total - passed
  console.log(`演练结果: ${passed}/${total} 通过, ${failed} 失败`)
  console.log("═══════════════════════════════════════\n")

  return report
}

// ─── 入口 ────────────────────────────────────────────────────────────────

const workspaceId = process.argv.find((a) => a.startsWith("--workspace-id="))?.split("=")[1] || "ws-drill"
const agentId = process.argv.find((a) => a.startsWith("--agent-id="))?.split("=")[1] || "agent-drill"

drill(workspaceId, agentId)
  .then((result) => {
    const failed = result.filter((r) => r.status === "fail").length
    process.exit(failed > 0 ? 1 : 0)
  })
  .catch((err) => {
    console.error("演练异常:", err)
    process.exit(1)
  })
