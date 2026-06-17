import { describe, it, expect, beforeAll, vi } from "vitest"

// Mock 运行日志写入服务，避免 Prisma 抛出外键越界约束警告污染测试输出
vi.mock("@/lib/server/agent-log", () => ({
  writeAgentLog: vi.fn().mockResolvedValue(undefined),
}))

import type { TaskEnvelope } from "@hermesclaw/event-contracts"
import { ACTION_RECEIPT_VERSION } from "@hermesclaw/event-contracts"

describe("OpenClaw HTTP Client", () => {
  let openclawClient: any

  beforeAll(async () => {
    // 动态加载前配置环境变量以覆盖静态模块缓存
    process.env.OPENCLAW_USE_MOCK = "true"
    const mod = await import("../client")
    openclawClient = mod.openclawClient
  })

  it("should execute task in mock mode and return standard ActionReceipt", async () => {
    const envelope: TaskEnvelope = {
      taskId: "t-test-123",
      workflowRunId: "run-test-123",
      workspaceId: "ws-test-123",
      industryId: "ind-test-123",
      agentId: "agent-test-123",
      actionType: "email.send",
      input: {
        taskName: "Mock测试任务",
        to: "target@example.com",
        subject: "测试主题",
      },
      automationLevel: "L2",
      riskLevel: "medium",
      idempotencyKey: "idem-test-123",
      callbackTarget: "cb-test-123",
      policySnapshotVersion: "1.0.0",
      version: "1.0.0",
    }

    const receipt = await openclawClient.executeTask(envelope)

    expect(receipt.taskId).toBe(envelope.taskId)
    expect(receipt.workflowRunId).toBe(envelope.workflowRunId)
    expect(receipt.idempotencyKey).toBe(envelope.idempotencyKey)
    expect(receipt.connectorId).toBe("email") // actionType.split('.')[0]
    expect(receipt.executedAt).toBeDefined()
    expect(receipt.receiptId).toBeDefined()
    expect(["success", "failure"]).toContain(receipt.outcome)
    expect(receipt.version).toBe(ACTION_RECEIPT_VERSION)
  })

  it("should retrieve connector status in mock mode", async () => {
    const status = await openclawClient.getConnectorStatus("email-connector")
    expect(status.connectorId).toBe("email-connector")
    expect(status.health).toBe("healthy")
    expect(status.latencyMs).toBeGreaterThan(0)
    expect(status.version).toBeDefined()
  })

  it("should trigger data sync in mock mode", async () => {
    const result = await openclawClient.syncData("crm", "inquiry")
    expect(result.syncId).toBeDefined()
    expect(result.status).toBe("completed")
    expect(result.totalRecords).toBeGreaterThan(0)
    expect(result.syncedRecords).toBe(result.totalRecords)
  })
})

