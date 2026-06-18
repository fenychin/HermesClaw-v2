/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  startCanary,
  promoteCanary,
  abortCanary,
  evaluateCanaryHealth,
  CanaryAlreadyExistsError,
  CanaryInvalidStateError,
  CanaryNotFoundError,
  ProposalNotApprovedError,
  CANARY_ROLLBACK_ERROR_RATE_THRESHOLD,
  CANARY_PROMOTE_SUCCESS_RATE_THRESHOLD,
  CANARY_PROMOTE_ERROR_RATE_THRESHOLD
} from "../canary"
import { prisma } from "@/lib/prisma"

// ==============================
// Prisma 模拟设置
// ==============================

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockFindUnique = vi.fn()
const mockFindFirst = vi.fn()
const mockFindMany = vi.fn()

vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    harnessProposal: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    harnessSnapshot: {
      findUnique: vi.fn(),
    },
    harnessCanary: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    $transaction: vi.fn(),
  }

  mockPrisma.$transaction.mockImplementation((cb) => cb(mockPrisma))

  return {
    prisma: mockPrisma
  }
})

// ==============================
// 审计日志模拟
// ==============================

const mockWriteAuditLog = vi.fn()
vi.mock("@/lib/server/audit", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

describe("Harness Canary State Machine Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockPrisma = (prisma as any)
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma))
  })

  describe("startCanary", () => {
    it("当流量百分比越界时应抛出 RangeError", async () => {
      await expect(
        startCanary({
          proposalId: "prop-1",
          workspaceId: "ws-1",
          agentId: "agent-1",
          snapshotId: "hss-1",
          trafficPercent: 120,
        })
      ).rejects.toThrow(RangeError)

      await expect(
        startCanary({
          proposalId: "prop-1",
          workspaceId: "ws-1",
          agentId: "agent-1",
          snapshotId: "hss-1",
          trafficPercent: 0,
        })
      ).rejects.toThrow(RangeError)
    })

    it("当提案非 approved 时应抛出 ProposalNotApprovedError", async () => {
      vi.mocked(prisma.harnessProposal.findUnique).mockResolvedValue({
        id: "prop-1",
        status: "pending",
      } as any)

      await expect(
        startCanary({
          proposalId: "prop-1",
          workspaceId: "ws-1",
          agentId: "agent-1",
          snapshotId: "hss-1",
        })
      ).rejects.toThrow(ProposalNotApprovedError)
    })

    it("当同提案 canary 已存在时应抛出 CanaryAlreadyExistsError", async () => {
      vi.mocked(prisma.harnessProposal.findUnique).mockResolvedValue({
        id: "prop-1",
        status: "approved",
      } as any)

      mockFindUnique.mockResolvedValue({
        canaryId: "hca-existing",
      } as any)

      await expect(
        startCanary({
          proposalId: "prop-1",
          workspaceId: "ws-1",
          agentId: "agent-1",
          snapshotId: "hss-1",
        })
      ).rejects.toThrow(CanaryAlreadyExistsError)
    })

    it("当快照不存在时应抛出 Error", async () => {
      vi.mocked(prisma.harnessProposal.findUnique).mockResolvedValue({
        id: "prop-1",
        status: "approved",
      } as any)

      mockFindUnique.mockResolvedValue(null) // canary 尚不存在
      vi.mocked(prisma.harnessSnapshot.findUnique).mockResolvedValue(null) // snapshot 不存在

      await expect(
        startCanary({
          proposalId: "prop-1",
          workspaceId: "ws-1",
          agentId: "agent-1",
          snapshotId: "hss-1",
        })
      ).rejects.toThrow(/Snapshot not found/)
    })

    it("各项验证均通过时应成功创建 Canary 并更新提案状态及审计", async () => {
      vi.mocked(prisma.harnessProposal.findUnique).mockResolvedValue({
        id: "prop-1",
        status: "approved",
      } as any)

      mockFindUnique.mockResolvedValue(null) // canary 不存在
      vi.mocked(prisma.harnessSnapshot.findUnique).mockResolvedValue({
        snapshotId: "hss-1",
      } as any)

      const mockDbRecord = {
        canaryId: "hca-new",
        workspaceId: "ws-1",
        proposalId: "prop-1",
        agentId: "agent-1",
        snapshotId: "hss-1",
        trafficPercent: 10,
        observationWindowMs: 86400000,
        startedAt: new Date(),
        endsAt: new Date(Date.now() + 86400000),
        status: "running",
      }

      mockCreate.mockResolvedValue(mockDbRecord)
      mockWriteAuditLog.mockResolvedValue(undefined)

      const result = await startCanary({
        proposalId: "prop-1",
        workspaceId: "ws-1",
        agentId: "agent-1",
        snapshotId: "hss-1",
      })

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "ws-1",
          proposalId: "prop-1",
          agentId: "agent-1",
          snapshotId: "hss-1",
          trafficPercent: 10,
          status: "running",
        }),
      })

      expect(prisma.harnessProposal.update).toHaveBeenCalledWith({
        where: { id: "prop-1" },
        data: { status: "canary" },
      })

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "canary.started",
          targetType: "canary",
          workspaceId: "ws-1",
        })
      )

      expect(result.canaryId).toBe("hca-new")
      expect(result.status).toBe("running")
    })
  })

  describe("promoteCanary", () => {
    it("canary 不存在时应抛出 CanaryNotFoundError", async () => {
      mockFindUnique.mockResolvedValue(null)

      await expect(
        promoteCanary("non-existent-canary", "system")
      ).rejects.toThrow(CanaryNotFoundError)
    })

    it("状态不为 running 或 promoting 时应抛出 CanaryInvalidStateError", async () => {
      mockFindUnique.mockResolvedValue({
        canaryId: "hca-1",
        status: "promoted",
      } as any)

      await expect(
        promoteCanary("hca-1", "system")
      ).rejects.toThrow(CanaryInvalidStateError)
    })

    it("状态正常时应成功晋级并更新提案为 active 及审计日志", async () => {
      mockFindUnique.mockResolvedValue({
        canaryId: "hca-1",
        proposalId: "prop-1",
        status: "running",
      } as any)

      const mockUpdatedRecord = {
        canaryId: "hca-1",
        status: "promoted",
        workspaceId: "ws-1",
      }
      mockUpdate.mockResolvedValue(mockUpdatedRecord)

      const result = await promoteCanary("hca-1", "system")

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { canaryId: "hca-1" },
        data: expect.objectContaining({
          status: "promoted",
          promotedBy: "system",
        }),
      })

      expect(prisma.harnessProposal.update).toHaveBeenCalledWith({
        where: { id: "prop-1" },
        data: { status: "active" },
      })

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "canary.promoted",
          actor: "system",
        })
      )

      expect(result.status).toBe("promoted")
    })
  })

  describe("abortCanary", () => {
    it("状态不为 running 或 rolling-back 时应抛出 CanaryInvalidStateError", async () => {
      mockFindUnique.mockResolvedValue({
        canaryId: "hca-1",
        status: "promoted",
      } as any)

      await expect(
        abortCanary("hca-1", "metrics failed", "system")
      ).rejects.toThrow(CanaryInvalidStateError)
    })

    it("应正确中止 Canary 并调用回滚钩子及更新提案状态为 rolled-back", async () => {
      mockFindUnique.mockResolvedValue({
        canaryId: "hca-1",
        proposalId: "prop-1",
        status: "running",
      } as any)

      const mockUpdatedRecord = {
        canaryId: "hca-1",
        status: "rolling-back",
        workspaceId: "ws-1",
      }
      mockUpdate.mockResolvedValue(mockUpdatedRecord)

      const mockTriggerRollback = vi.fn()

      const result = await abortCanary("hca-1", "metrics failed", "system", {
        writeAuditLog: mockWriteAuditLog,
        triggerRollback: mockTriggerRollback,
      })

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { canaryId: "hca-1" },
        data: expect.objectContaining({
          status: "rolling-back",
          rollbackReason: "metrics failed",
        }),
      })

      expect(prisma.harnessProposal.update).toHaveBeenCalledWith({
        where: { id: "prop-1" },
        data: { status: "rolled_back" },
      })

      expect(mockTriggerRollback).toHaveBeenCalledWith("hca-1", "metrics failed")
      expect(result.status).toBe("rolling-back")
    })
  })

  describe("evaluateCanaryHealth", () => {
    it("窗口未结束但错误率超标应触发 early abort (紧急回滚)", async () => {
      const mockRunningCanary = {
        canaryId: "hca-early",
        workspaceId: "ws-1",
        proposalId: "prop-1",
        agentId: "agent-1",
        endsAt: new Date(Date.now() + 1000000), // 未到期
        status: "running",
      }
      mockFindMany.mockResolvedValue([mockRunningCanary])

      mockFindUnique.mockResolvedValue(mockRunningCanary) // abortCanary 内部读取
      mockUpdate.mockResolvedValue({ ...mockRunningCanary, status: "rolling-back" }) // abortCanary 内部更新

      const mockGetLatestMetrics = vi.fn().mockResolvedValue({
        errorRate: CANARY_ROLLBACK_ERROR_RATE_THRESHOLD + 0.05, // 超过回滚阈值
        successRate: 0.75,
      })

      const mockTriggerRollback = vi.fn()

      const result = await evaluateCanaryHealth(undefined, {
        writeAuditLog: mockWriteAuditLog,
        getLatestMetrics: mockGetLatestMetrics,
        triggerRollback: mockTriggerRollback,
      })

      expect(mockGetLatestMetrics).toHaveBeenCalledWith("ws-1", "agent-1")
      expect(mockTriggerRollback).toHaveBeenCalled()
      expect(result.earlyAborted).toBe(1)
      expect(result.promoted).toBe(0)
    })

    it("观察窗口结束且指标良好时应触发自动晋级", async () => {
      const mockExpiredCanary = {
        canaryId: "hca-expired",
        workspaceId: "ws-1",
        proposalId: "prop-1",
        agentId: "agent-1",
        endsAt: new Date(Date.now() - 1000), // 已到期
        status: "running",
      }
      mockFindMany.mockResolvedValue([mockExpiredCanary])

      mockFindUnique.mockResolvedValue(mockExpiredCanary)
      mockUpdate.mockResolvedValue({ ...mockExpiredCanary, status: "promoted" })

      const mockGetLatestMetrics = vi.fn().mockResolvedValue({
        errorRate: CANARY_PROMOTE_ERROR_RATE_THRESHOLD - 0.01,
        successRate: CANARY_PROMOTE_SUCCESS_RATE_THRESHOLD + 0.02,
      })

      const result = await evaluateCanaryHealth(undefined, {
        writeAuditLog: mockWriteAuditLog,
        getLatestMetrics: mockGetLatestMetrics,
      })

      expect(result.promoted).toBe(1)
      expect(result.rolledBack).toBe(0)
      expect(result.ambiguous).toBe(0)
    })

    it("观察窗口结束且指标恶化时应触发自动回滚", async () => {
      const mockExpiredCanary = {
        canaryId: "hca-expired",
        workspaceId: "ws-1",
        proposalId: "prop-1",
        agentId: "agent-1",
        endsAt: new Date(Date.now() - 1000), // 已到期
        status: "running",
      }
      mockFindMany.mockResolvedValue([mockExpiredCanary])

      mockFindUnique.mockResolvedValue(mockExpiredCanary)
      mockUpdate.mockResolvedValue({ ...mockExpiredCanary, status: "rolling-back" })

      const mockGetLatestMetrics = vi.fn().mockResolvedValue({
        errorRate: CANARY_ROLLBACK_ERROR_RATE_THRESHOLD + 0.02,
        successRate: 0.70,
      })

      const mockTriggerRollback = vi.fn()

      const result = await evaluateCanaryHealth(undefined, {
        writeAuditLog: mockWriteAuditLog,
        getLatestMetrics: mockGetLatestMetrics,
        triggerRollback: mockTriggerRollback,
      })

      expect(result.rolledBack).toBe(1)
      expect(mockTriggerRollback).toHaveBeenCalled()
    })

    it("观察窗口结束但指标含糊时应保持 running 并写入审计警告", async () => {
      const mockExpiredCanary = {
        canaryId: "hca-expired",
        workspaceId: "ws-1",
        proposalId: "prop-1",
        agentId: "agent-1",
        endsAt: new Date(Date.now() - 1000), // 已到期
        status: "running",
      }
      mockFindMany.mockResolvedValue([mockExpiredCanary])

      const mockGetLatestMetrics = vi.fn().mockResolvedValue({
        errorRate: 0.12, // 介于 5% 到 20% 之间，既不能晋级也不能回滚
        successRate: 0.88,
      })

      const result = await evaluateCanaryHealth(undefined, {
        writeAuditLog: mockWriteAuditLog,
        getLatestMetrics: mockGetLatestMetrics,
      })

      expect(result.ambiguous).toBe(1)
      expect(result.promoted).toBe(0)
      expect(result.rolledBack).toBe(0)
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "canary.ambiguous",
          riskLevel: "medium",
        })
      )
    })
  })
})
