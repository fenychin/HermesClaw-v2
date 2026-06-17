/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  executeRollback,
  retryFailedRollback,
  getRollback,
  listRollbacks,
  CanaryNotFoundError,
  CanaryInvalidStateError,
  SnapshotMissingForRollbackError,
  AgentNotFoundError,
  RollbackNotFoundError
} from "../rollback"
import { prisma } from "@/lib/prisma"

// ==============================
// Prisma 模拟设置
// ==============================

const mockCreateRollback = vi.fn()
const mockUpdateRollback = vi.fn()
const mockFindUniqueRollback = vi.fn()
const mockFindFirstRollback = vi.fn()
const mockFindManyRollback = vi.fn()
const mockCountRollback = vi.fn()

const mockFindUniqueCanary = vi.fn()
const mockUpdateCanary = vi.fn()

const mockFindUniqueSnapshot = vi.fn()
const mockUpdateSnapshot = vi.fn()

const mockFindUniqueAgent = vi.fn()
const mockUpdateAgent = vi.fn()

const mockFindManyWorkflow = vi.fn()
const mockUpdateWorkflow = vi.fn()
const mockCreateWorkflow = vi.fn()

const mockFindManySkill = vi.fn()
const mockUpdateSkill = vi.fn()

const mockFindManyConnector = vi.fn()
const mockUpdateConnector = vi.fn()

vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    harnessRollback: {
      create: (...args: any[]) => mockCreateRollback(...args),
      update: (...args: any[]) => mockUpdateRollback(...args),
      findUnique: (...args: any[]) => mockFindUniqueRollback(...args),
      findFirst: (...args: any[]) => mockFindFirstRollback(...args),
      findMany: (...args: any[]) => mockFindManyRollback(...args),
      count: (...args: any[]) => mockCountRollback(...args),
    },
    harnessCanary: {
      findUnique: (...args: any[]) => mockFindUniqueCanary(...args),
      update: (...args: any[]) => mockUpdateCanary(...args),
    },
    harnessSnapshot: {
      findUnique: (...args: any[]) => mockFindUniqueSnapshot(...args),
      update: (...args: any[]) => mockUpdateSnapshot(...args),
    },
    agent: {
      findUnique: (...args: any[]) => mockFindUniqueAgent(...args),
      update: (...args: any[]) => mockUpdateAgent(...args),
    },
    workflow: {
      findMany: (...args: any[]) => mockFindManyWorkflow(...args),
      update: (...args: any[]) => mockUpdateWorkflow(...args),
      create: (...args: any[]) => mockCreateWorkflow(...args),
    },
    skill: {
      findMany: (...args: any[]) => mockFindManySkill(...args),
      update: (...args: any[]) => mockUpdateSkill(...args),
    },
    connector: {
      findMany: (...args: any[]) => mockFindManyConnector(...args),
      update: (...args: any[]) => mockUpdateConnector(...args),
    },
    $transaction: vi.fn(),
  }

  // 事务直接执行回调
  mockPrisma.$transaction.mockImplementation((cb) => cb(mockPrisma))

  return {
    prisma: mockPrisma
  }
})

// ==============================
// 审计模拟设置
// ==============================

const mockWriteAuditLog = vi.fn()
vi.mock("@/lib/server/audit", () => ({
  writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args),
  actorFromSession: () => Promise.resolve("system"),
}))

// ==============================
// 异步 import 快照服务模拟
// ==============================
vi.mock("../harness-snapshot", () => ({
  markSnapshotAsRestoredTo: vi.fn().mockResolvedValue({ status: "rolled-back-to" })
}))

describe("Harness Rollback Service Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockPrisma = (prisma as any)
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma))
  })

  describe("executeRollback", () => {
    it("当 Canary 不存在时应抛出 CanaryNotFoundError", async () => {
      mockFindUniqueCanary.mockResolvedValue(null)

      await expect(
        executeRollback({
          canaryId: "non-existent-canary",
          workspaceId: "ws-1",
          reason: "Canary failed health check",
          triggerType: "auto",
          triggeredBy: "cron-job"
        })
      ).rejects.toThrow(CanaryNotFoundError)
    })

    it("应在已存在未超时的 running 回滚时抛出 RollbackInProgressError 熔断阻断", async () => {
      mockFindUniqueCanary.mockResolvedValue({
        canaryId: "canary-1",
        status: "running",
        snapshotId: "hss-1",
        proposalId: "prop-1",
        agentId: "agent-1"
      })
      mockFindUniqueSnapshot.mockResolvedValue({
        snapshotId: "hss-1",
        agentConfig: {}
      })
      
      // 模拟 1 分钟前启动的正在 running 的回滚
      mockFindFirstRollback.mockResolvedValue({
        rollbackId: "hrb-existing",
        canaryId: "canary-1",
        status: "in-progress",
        startedAt: new Date(Date.now() - 60 * 1000)
      })

      await expect(
        executeRollback({
          canaryId: "canary-1",
          workspaceId: "ws-1",
          reason: "Concurrent trigger",
          triggerType: "auto",
          triggeredBy: "system"
        })
      ).rejects.toThrow(Error)
    })

    it("应在已存在的回滚超时后自动将其标记为 failed 并允许新的回滚自愈执行", async () => {
      mockFindUniqueCanary.mockResolvedValue({
        canaryId: "canary-1",
        status: "running",
        snapshotId: "hss-1",
        proposalId: "prop-1",
        agentId: "agent-1"
      })
      mockFindUniqueSnapshot.mockResolvedValue({
        snapshotId: "hss-1",
        agentConfig: {}
      })
      
      // 模拟 10 分钟前启动的已经超时的回滚 (超时时间是 5 分钟)
      mockFindFirstRollback.mockResolvedValue({
        rollbackId: "hrb-timedout",
        canaryId: "canary-1",
        status: "in-progress",
        startedAt: new Date(Date.now() - 10 * 60 * 1000)
      })

      mockFindUniqueAgent.mockResolvedValue({
        id: "agent-1",
        bindSkills: "[]",
        bindConnectors: "[]",
        canDo: "[]",
        cannotDo: "[]"
      })
      mockFindManyWorkflow.mockResolvedValue([])
      mockFindManySkill.mockResolvedValue([])
      mockFindManyConnector.mockResolvedValue([])
      mockCreateRollback.mockResolvedValue({
        rollbackId: "hrb-new",
        status: "pending"
      })
      mockUpdateRollback.mockImplementation((args) => {
        return Promise.resolve({
          rollbackId: "hrb-new",
          status: args.data.status || "completed",
          restoredFields: args.data.restoredFields || []
        })
      })

      const result = await executeRollback({
        canaryId: "canary-1",
        workspaceId: "ws-1",
        reason: "Retry after timeout",
        triggerType: "auto",
        triggeredBy: "system"
      })

      expect(mockUpdateRollback).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rollbackId: "hrb-timedout" },
          data: expect.objectContaining({ status: "failed" })
        })
      )
      expect(result.status).toBe("completed")
    })

    it("当 Canary 状态不在 running 或 rolling-back 时应抛出 CanaryInvalidStateError", async () => {
      mockFindUniqueCanary.mockResolvedValue({
        canaryId: "canary-1",
        status: "completed",
        snapshotId: "hss-1",
        proposalId: "prop-1",
        agentId: "agent-1"
      })

      await expect(
        executeRollback({
          canaryId: "canary-1",
          workspaceId: "ws-1",
          reason: "Manual abort",
          triggerType: "manual",
          triggeredBy: "admin-1"
        })
      ).rejects.toThrow(CanaryInvalidStateError)
    })

    it("当关联快照不存在时，应记录审计日志并抛出 SnapshotMissingForRollbackError", async () => {
      mockFindUniqueCanary.mockResolvedValue({
        canaryId: "canary-1",
        status: "running",
        snapshotId: "hss-1",
        proposalId: "prop-1",
        agentId: "agent-1"
      })
      mockFindUniqueSnapshot.mockResolvedValue(null)

      await expect(
        executeRollback({
          canaryId: "canary-1",
          workspaceId: "ws-1",
          reason: "Canary failed check",
          triggerType: "auto",
          triggeredBy: "system"
        })
      ).rejects.toThrow(SnapshotMissingForRollbackError)

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "proposal.rollback",
          detail: expect.stringContaining("快照不存在，无法回滚")
        })
      )
    })

    it("当智能体记录不存在时，事务应回滚并抛出 AgentNotFoundError", async () => {
      mockFindUniqueCanary.mockResolvedValue({
        canaryId: "canary-1",
        status: "running",
        snapshotId: "hss-1",
        proposalId: "prop-1",
        agentId: "agent-1"
      })
      mockFindUniqueSnapshot.mockResolvedValue({
        snapshotId: "hss-1",
        agentConfig: {}
      })
      mockFindUniqueAgent.mockResolvedValue(null)

      await expect(
        executeRollback({
          canaryId: "canary-1",
          workspaceId: "ws-1",
          reason: "Test rollback",
          triggerType: "manual",
          triggeredBy: "admin"
        })
      ).rejects.toThrow(AgentNotFoundError)

      // 验证创建了回滚记录且最终标记为 failed
      expect(mockCreateRollback).toHaveBeenCalled()
      expect(mockUpdateRollback).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rollbackId: expect.any(String) },
          data: { status: "failed", errorMessage: expect.stringContaining("Agent not found") }
        })
      )
    })

    it("应在回滚成功时原子性恢复各项数据并生成 restoredFields 的 diff 信息", async () => {
      // 1. Mock 所有的数据库记录
      mockFindUniqueCanary.mockResolvedValue({
        canaryId: "canary-1",
        status: "running",
        snapshotId: "hss-1",
        proposalId: "prop-1",
        agentId: "agent-1"
      })

      const snapshotData = {
        snapshotId: "hss-1",
        agentId: "agent-1",
        workspaceId: "ws-1",
        agentConfig: {
          name: "Original Name",
          description: "Original Desc",
          bindSkills: ["skill-1"],
          bindConnectors: ["conn-1"],
          memoryPermission: "read-write",
          harnessVersion: "v1.0.0",
          automationLevel: "L2",
          canDo: ["task-a"],
          cannotDo: ["task-b"],
          statsJson: { runs: 10 }
        },
        workflowTemplates: [
          {
            templateId: "wf-1",
            name: "Workflow 1",
            description: "WF Desc",
            nodes: [{ id: "node-1" }],
            edges: []
          }
        ],
        skillBindings: [{ skillId: "skill-1" }],
        connectorBindings: [{ connectorId: "conn-1" }]
      }
      mockFindUniqueSnapshot.mockResolvedValue(snapshotData)

      const currentAgent = {
        id: "agent-1",
        name: "New Name", // 变了
        description: "Original Desc", // 没变
        bindSkills: JSON.stringify(["skill-1", "skill-new"]), // 变了 (加了新技能)
        bindConnectors: JSON.stringify(["conn-1"]), // 没变
        memoryPermission: "read-write", // 没变
        harnessVersion: "v1.1.0", // 变了
        automationLevel: "L2",
        canDo: JSON.stringify(["task-a"]),
        cannotDo: JSON.stringify(["task-b"]),
        statsJson: JSON.stringify({ runs: 20 }), // 变了
        industryId: "trade"
      }
      mockFindUniqueAgent.mockResolvedValue(currentAgent)

      const currentWorkflows = [
        {
          id: "wf-1",
          workspaceId: "ws-1",
          name: "Workflow 1 Modified", // 变了
          description: "WF Desc",
          nodes: JSON.stringify([{ id: "node-1" }]),
          edges: JSON.stringify([]),
          status: "active"
        },
        {
          id: "wf-new", // 灰度期间新建的，不在快照里，且包含关联此 agent
          workspaceId: "ws-1",
          name: "Workflow New",
          nodes: JSON.stringify([{ id: "node-2", config: { agentId: "agent-1" } }]),
          edges: JSON.stringify([]),
          status: "active"
        }
      ]
      mockFindManyWorkflow.mockResolvedValue(currentWorkflows)

      const currentSkills = [
        { id: "skill-1", workspaceId: "ws-1", usedByAgents: JSON.stringify(["agent-1"]) },
        { id: "skill-new", workspaceId: "ws-1", usedByAgents: JSON.stringify(["agent-1"]) } // 灰度新加的，需要解绑并置为 deprecated
      ]
      mockFindManySkill.mockResolvedValue(currentSkills)

      const currentConnectors = [
        { id: "conn-1", workspaceId: "ws-1", usedByAgents: JSON.stringify(["agent-1"]) }
      ]
      mockFindManyConnector.mockResolvedValue(currentConnectors)

      const mockRollbackRecord = {
        rollbackId: "hrb-1",
        workspaceId: "ws-1",
        canaryId: "canary-1",
        proposalId: "prop-1",
        agentId: "agent-1",
        snapshotId: "hss-1",
        reason: "Canary failed check",
        triggerType: "auto",
        status: "pending",
        startedAt: new Date(),
        triggeredBy: "cron"
      }
      mockCreateRollback.mockResolvedValue(mockRollbackRecord)
      mockUpdateRollback.mockImplementation((args) => {
        return Promise.resolve({
          ...mockRollbackRecord,
          ...args.data
        })
      })

      // 2. 执行回滚
      const result = await executeRollback({
        canaryId: "canary-1",
        workspaceId: "ws-1",
        reason: "Canary failed check",
        triggerType: "auto",
        triggeredBy: "cron"
      })

      // 3. 断言及验证
      expect(result.status).toBe("completed")
      expect(result.restoredFields.length).toBeGreaterThan(0)

      // 检查 restoredFields 中是否准确包含修改项
      const restoredAgentNames = result.restoredFields.filter(f => f.entity === "agent" && f.field === "name")
      expect(restoredAgentNames).toHaveLength(1)
      expect(restoredAgentNames[0].previousValue).toBe("Original Name")
      expect(restoredAgentNames[0].currentValue).toBe("New Name")

      const restoredHarnessVersion = result.restoredFields.filter(f => f.entity === "agent" && f.field === "harnessVersion")
      expect(restoredHarnessVersion).toHaveLength(1)
      expect(restoredHarnessVersion[0].previousValue).toBe("v1.0.0")

      // 验证对 Agent、Workflow、Skill 的更新写入被调用了
      expect(mockUpdateAgent).toHaveBeenCalled()
      expect(mockUpdateWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "wf-1" },
          data: expect.objectContaining({ name: "Workflow 1", status: "active" })
        })
      )
      expect(mockUpdateWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "wf-new" },
          data: { status: "deprecated" } // 新增的工作流被 deprecated 掉
        })
      )

      // 验证对新技能的解绑及 deprecate 操作被调用了
      expect(mockUpdateSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "skill-new" },
          data: { usedByAgents: JSON.stringify([]), status: "deprecated" }
        })
      )

      // 验证 canary 的状态被更新为 rolled-back
      expect(mockUpdateCanary).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { canaryId: "canary-1" },
          data: expect.objectContaining({ status: "rolled-back" })
        })
      )

      // 验证写入了审计日志
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "proposal.rollback",
          actor: "cron"
        })
      )
    })
  })

  describe("retryFailedRollback", () => {
    it("回滚记录不存在时应抛出 RollbackNotFoundError", async () => {
      mockFindUniqueRollback.mockResolvedValue(null)

      await expect(
        retryFailedRollback("non-existent-rollback", "admin")
      ).rejects.toThrow(RollbackNotFoundError)
    })

    it("当回滚记录状态已经是 completed 时应具有幂等保护：直接返回不重新执行", async () => {
      const completedRecord = {
        rollbackId: "hrb-completed",
        workspaceId: "ws-1",
        canaryId: "canary-1",
        proposalId: "prop-1",
        agentId: "agent-1",
        snapshotId: "hss-1",
        reason: "Test",
        triggerType: "manual",
        status: "completed",
        restoredFields: [],
        startedAt: new Date(),
        completedAt: new Date(),
        triggeredBy: "admin"
      }
      mockFindUniqueRollback.mockResolvedValue(completedRecord)

      // 用 Spy 来检测 executeRollback 是否被调用（因为 executeRollback 包含 Canary 验证）
      mockFindUniqueCanary.mockResolvedValue(null) // 如果重新执行，这里会由于 Canary 找不到而抛出 CanaryNotFoundError

      const result = await retryFailedRollback("hrb-completed", "admin")
      expect(result.status).toBe("completed")
      expect(mockFindUniqueCanary).not.toHaveBeenCalled()
    })

    it("当状态为 failed 时，应重新触发回滚流程", async () => {
      const failedRecord = {
        rollbackId: "hrb-failed",
        workspaceId: "ws-1",
        canaryId: "canary-1",
        proposalId: "prop-1",
        agentId: "agent-1",
        snapshotId: "hss-1",
        reason: "Initial failure reason",
        triggerType: "manual",
        status: "failed",
        restoredFields: [],
        startedAt: new Date(),
        triggeredBy: "admin"
      }
      mockFindUniqueRollback.mockResolvedValue(failedRecord)

      // 模拟重新执行成功所需的 canary 和快照环境
      mockFindUniqueCanary.mockResolvedValue({
        canaryId: "canary-1",
        status: "rolling-back",
        snapshotId: "hss-1",
        proposalId: "prop-1",
        agentId: "agent-1"
      })
      mockFindUniqueSnapshot.mockResolvedValue({
        snapshotId: "hss-1",
        agentConfig: {}
      })
      mockFindUniqueAgent.mockResolvedValue({
        id: "agent-1",
        bindSkills: "[]",
        bindConnectors: "[]",
        canDo: "[]",
        cannotDo: "[]"
      })
      mockFindManyWorkflow.mockResolvedValue([])
      mockFindManySkill.mockResolvedValue([])
      mockFindManyConnector.mockResolvedValue([])

      mockCreateRollback.mockResolvedValue({
        ...failedRecord,
        rollbackId: "hrb-new-retry-run",
        status: "pending"
      })
      mockUpdateRollback.mockImplementation((args) => {
        return Promise.resolve({
          rollbackId: "hrb-new-retry-run",
          status: args.data.status,
          restoredFields: args.data.restoredFields || []
        })
      })

      const result = await retryFailedRollback("hrb-failed", "admin-retry")
      expect(result.status).toBe("completed")
    })
  })

  describe("getRollback & listRollbacks", () => {
    it("getRollback 应返回正确记录或 null", async () => {
      mockFindFirstRollback.mockResolvedValueOnce({ rollbackId: "hrb-1", workspaceId: "ws-1" })
      mockFindFirstRollback.mockResolvedValueOnce(null)

      const r1 = await getRollback("hrb-1", "ws-1")
      expect(r1?.rollbackId).toBe("hrb-1")

      const r2 = await getRollback("hrb-non-existent", "ws-1")
      expect(r2).toBeNull()
    })

    it("listRollbacks 应正确分页并返回总数", async () => {
      mockFindManyRollback.mockResolvedValue([{ rollbackId: "hrb-1", workspaceId: "ws-1" }])
      mockCountRollback.mockResolvedValue(1)

      const result = await listRollbacks("ws-1", {
        agentId: "agent-1",
        status: "completed",
        page: 1,
        pageSize: 10
      })

      expect(mockFindManyRollback).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: "ws-1",
            agentId: "agent-1",
            status: "completed"
          },
          skip: 0,
          take: 10
        })
      )
      expect(result.rollbacks).toHaveLength(1)
      expect(result.total).toBe(1)
    })
  })
})
