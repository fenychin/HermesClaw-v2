import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { captureSnapshot } from "@/lib/server/harness-snapshot"
import { startCanary, evaluateCanaryHealth } from "@/lib/server/canary"
import { executeRollback } from "@/lib/server/rollback"
import { setupWorkspace, cleanWorkspace } from "./e2e-helper"

describe("E2E Integration Link 5: Canary Rollback Complete Path", () => {
  const workspaceId = "ws-e2e-rollback"
  const agentId = "agent-e2e-rollback"
  const workflowId = "wf-e2e-rollback"

  beforeAll(async () => {
    await cleanWorkspace(workspaceId)
    await setupWorkspace(workspaceId, {
      automationLevel: "L3",
      agentId,
      agentAutomationLevel: "L3",
      workflowId
    })
  })

  afterAll(async () => {
    await cleanWorkspace(workspaceId)
  })

  it("Canary 灰度指标恶化 → 触发巡检自愈 → 自动回滚原子恢复", async () => {
    // 为测试创建一个 HarnessProposal，状态设置为 approved
    const proposal = await prisma.harnessProposal.create({
      data: {
        id: "prop-e2e-rollback-001",
        proposalId: "HEP-e2e-rollback-001",
        workspaceId,
        triggeredBy: "manual",
        triggerReason: "E2E Test Upgrade",
        problemStatement: "Need to test rollback path",
        evidence: JSON.stringify(["test data"]),
        proposedChange: {
          targetComponent: "任务边界",
          description: "canary upgrade",
          riskLevel: "medium",
          automationLevel: "L2"
        } as any,
        estimatedImpact: "reduce error rate",
        rollbackPlan: "rollback to snapshot",
        status: "approved"
      }
    })

    // Step 1: 创建 Snapshot
    const snapshot = await captureSnapshot({
      workspaceId,
      agentId,
      proposalId: proposal.id,
      snapshotType: "pre-canary",
      createdBy: "admin",
      policySnapshotVersion: "v1.0"
    })

    expect(snapshot).toBeDefined()
    expect(snapshot.snapshotId).toBeDefined()
    expect(snapshot.agentConfig).toBeDefined()
    expect(snapshot.workflowTemplates).toBeDefined()

    // 模拟修改 Agent（代表发布了 Canary 后的新状态）
    await prisma.agent.update({
      where: { id: agentId },
      data: { name: "Canary Upgraded Agent Name" }
    })

    // Step 2: 启动 Canary
    const canary = await startCanary({
      proposalId: proposal.id,
      workspaceId,
      agentId,
      snapshotId: snapshot.snapshotId,
      trafficPercent: 10,
      observationWindowMs: 5000,
      startedBy: "admin"
    })

    expect(canary).toBeDefined()
    expect(canary.status).toBe("running")
    expect(canary.trafficPercent).toBe(10)

    // Step 3 & 4: 模拟指标恶化并触发巡检，自动回滚
    const mockWriteAuditLog = vi.fn(async (args) => {
      await prisma.auditLog.create({
        data: {
          actor: args.actor,
          action: args.action,
          targetType: args.targetType,
          targetId: args.targetId,
          detail: args.detail ?? null,
          riskLevel: args.riskLevel ?? null,
          workspaceId: args.workspaceId,
          status: "success"
        }
      })
    })

    const evalResult = await evaluateCanaryHealth(workspaceId, {
      writeAuditLog: mockWriteAuditLog,
      getLatestMetrics: async () => ({
        errorRate: 0.60, // 高于 20% 红线，触发 Early Abort
        successRate: 0.40,
        avgLatencyMs: 150,
        humanCorrectionRate: 0.0,
        connectorSuccessRate: 0.60
      }),
      triggerRollback: async (canaryId, reason) => {
        // 原子执行回滚恢复
        await executeRollback({
          canaryId,
          workspaceId,
          reason,
          triggerType: "auto",
          triggeredBy: "system"
        }, {
          writeAuditLog: mockWriteAuditLog
        })
      }
    })

    // 断言巡检检测到恶化指标，且早期中止 (earlyAborted) 数加 1
    expect(evalResult.earlyAborted).toBe(1)

    // 断言 CanaryDeployment（HarnessCanary）状态更新为 rolled-back
    const updatedCanary = await prisma.harnessCanary.findUnique({
      where: { canaryId: canary.canaryId }
    })
    expect(updatedCanary?.status).toBe("rolled-back")
    expect(updatedCanary?.rollbackReason).toContain("Early abort triggered")

    // 断言回滚状态为 completed，且 agent 配置恢复为 snapshot 中的原值
    const rollback = await prisma.harnessRollback.findFirst({
      where: { workspaceId, canaryId: canary.canaryId }
    })
    expect(rollback).not.toBeNull()
    expect(rollback?.status).toBe("completed")

    const restoredAgent = await prisma.agent.findUnique({
      where: { id: agentId }
    })
    const originalAgentConfig = snapshot.agentConfig as any
    // 断言已成功回滚恢复 Agent 配置字段值
    expect(restoredAgent?.name).toBe(originalAgentConfig.name)

    // Step 5: 审计链路完整断言
    // A. 写入 canary.aborted 审计日志
    const abortedAudit = await prisma.auditLog.findFirst({
      where: { workspaceId, action: "canary.aborted", targetId: canary.canaryId }
    })
    expect(abortedAudit).not.toBeNull()

    // B. 写入 proposal.rollback 审计日志（由 executeRollback 触发）
    const rollbackAudit = await prisma.auditLog.findFirst({
      where: { workspaceId, action: "proposal.rollback", targetId: canary.canaryId }
    })
    expect(rollbackAudit).not.toBeNull()

    // C. 检查审计日志时序：canary.aborted 早于 proposal.rollback
    expect(abortedAudit!.createdAt.getTime()).toBeLessThanOrEqual(rollbackAudit!.createdAt.getTime())
  })
})
