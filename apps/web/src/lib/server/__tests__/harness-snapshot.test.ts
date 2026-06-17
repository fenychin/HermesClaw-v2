/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  captureSnapshot,
  getLatestSnapshot,
  listSnapshots,
  markSnapshotAsRestoredTo,
  AgentNotFoundError,
  SnapshotNotFoundError
} from "../harness-snapshot"
import { prisma } from "@/lib/prisma"

// ==============================
// Prisma 模拟设置
// ==============================

const mockUpdateMany = vi.fn()
const mockCreate = vi.fn()
const mockFindUnique = vi.fn()
const mockFindFirst = vi.fn()
const mockFindMany = vi.fn()
const mockCount = vi.fn()
const mockUpdate = vi.fn()

vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    agent: {
      findUnique: vi.fn(),
    },
    workflow: {
      findMany: vi.fn(),
    },
    skill: {
      findMany: vi.fn(),
    },
    connector: {
      findMany: vi.fn(),
    },
    harnessSnapshot: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    $transaction: vi.fn(),
  }
  
  // 事务模拟直接执行回调
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
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
  actorFromSession: () => Promise.resolve("system"),
}))

describe("Harness Snapshot Service Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认 transaction mock 设置
    const mockPrisma = (prisma as any)
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma))
  })

  describe("captureSnapshot", () => {
    it("应在 Agent 不存在时抛出 AgentNotFoundError", async () => {
      vi.mocked(prisma.agent.findUnique).mockResolvedValue(null)

      await expect(
        captureSnapshot({
          workspaceId: "ws-1",
          agentId: "non-existent-agent",
        })
      ).rejects.toThrow(AgentNotFoundError)
    })

    it("应在 Agent 工作区不匹配时抛出 AgentNotFoundError", async () => {
      const mockAgent = {
        id: "agent-1",
        workspaceId: "ws-other",
        name: "Test Agent",
        role: "assistant",
        description: "Test description",
        status: "idle",
        source: "custom",
        category: "[]",
        bindSkills: "[]",
        bindConnectors: "[]",
        memoryPermission: "read",
        harnessVersion: "v1.0.0",
        automationLevel: "L2",
        canDo: "[]",
        cannotDo: "[]",
        statsJson: "{}",
        industryId: null,
      }
      vi.mocked(prisma.agent.findUnique).mockResolvedValue(mockAgent as any)

      await expect(
        captureSnapshot({
          workspaceId: "ws-1",
          agentId: "agent-1",
        })
      ).rejects.toThrow(AgentNotFoundError)
    })

    it("应在 Agent 存在时成功捕获快照并写入审计日志", async () => {
      const mockAgent = {
        id: "agent-1",
        workspaceId: "ws-1",
        name: "Test Agent",
        role: "assistant",
        description: "Test description",
        status: "idle",
        source: "custom",
        category: JSON.stringify(["trade"]),
        bindSkills: JSON.stringify(["skill-1"]),
        bindConnectors: JSON.stringify(["conn-1"]),
        memoryPermission: "read-write",
        harnessVersion: "v1.1.0",
        automationLevel: "L2",
        canDo: JSON.stringify(["do-something"]),
        cannotDo: JSON.stringify(["do-harm"]),
        statsJson: JSON.stringify({ calls: 5 }),
        industryId: "foreign-trade",
      }
      vi.mocked(prisma.agent.findUnique).mockResolvedValue(mockAgent as any)

      const mockWorkflows = [
        {
          id: "wf-1",
          workspaceId: "ws-1",
          name: "Workflow 1",
          description: "Desc 1",
          nodes: JSON.stringify([{ id: "node-1", config: { agentId: "agent-1" } }]),
          edges: JSON.stringify([]),
          industryId: "foreign-trade",
        },
      ]
      vi.mocked(prisma.workflow.findMany).mockResolvedValue(mockWorkflows as any)

      const mockSkills = [
        {
          id: "skill-1",
          workspaceId: "ws-1",
          name: "Skill 1",
          description: "Skill Desc 1",
          version: "v1.0.0",
          automationLevel: "L2",
        },
      ]
      vi.mocked(prisma.skill.findMany).mockResolvedValue(mockSkills as any)

      const mockConnectors = [
        {
          id: "conn-1",
          workspaceId: "ws-1",
          name: "Connector 1",
          permissions: JSON.stringify(["read:data"]),
        },
      ]
      vi.mocked(prisma.connector.findMany).mockResolvedValue(mockConnectors as any)

      const mockSnapshotDbRecord = {
        id: "snapshot-row-1",
        snapshotId: "hss-mocked-uuid",
        workspaceId: "ws-1",
        agentId: "agent-1",
        proposalId: "prop-1",
        snapshotType: "pre-canary",
        agentConfig: { id: "agent-1" },
        workflowTemplates: [],
        skillBindings: [],
        connectorBindings: [],
        memoryPolicy: {},
        policySnapshotVersion: "v1.1.0",
        status: "active",
        createdAt: new Date(),
        createdBy: "test-user",
      }

      mockUpdateMany.mockResolvedValue({ count: 1 })
      mockCreate.mockResolvedValue(mockSnapshotDbRecord)
      mockWriteAuditLog.mockResolvedValue(undefined)

      const result = await captureSnapshot({
        workspaceId: "ws-1",
        agentId: "agent-1",
        proposalId: "prop-1",
        snapshotType: "pre-canary",
        createdBy: "test-user",
        policySnapshotVersion: "v1.1.0",
      })

      expect(prisma.agent.findUnique).toHaveBeenCalledWith({
        where: { id: "agent-1" },
      })
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          workspaceId: "ws-1",
          agentId: "agent-1",
          status: "active",
        },
        data: {
          status: "superseded",
        },
      })
      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "ws-1",
          agentId: "agent-1",
          proposalId: "prop-1",
          snapshotType: "pre-canary",
          createdBy: "test-user",
          policySnapshotVersion: "v1.1.0",
          status: "active",
        }),
      })

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: "test-user",
          action: "harness.snapshot.created",
          targetType: "agent",
          targetId: "agent-1",
          workspaceId: "ws-1",
        })
      )

      expect(result.snapshotId).toBe("hss-mocked-uuid")
      expect(result.status).toBe("active")
    })
  })

  describe("getLatestSnapshot", () => {
    it("当不存在 active 快照时应返回 null", async () => {
      mockFindFirst.mockResolvedValue(null)

      const result = await getLatestSnapshot("ws-1", "agent-1")
      expect(result).toBeNull()
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          workspaceId: "ws-1",
          agentId: "agent-1",
          status: "active",
        },
      })
    })

    it("当存在 active 快照时应正确返回", async () => {
      const mockRecord = {
        snapshotId: "hss-active",
        workspaceId: "ws-1",
        agentId: "agent-1",
        proposalId: "prop-1",
        snapshotType: "pre-canary",
        agentConfig: {},
        workflowTemplates: [],
        skillBindings: [],
        connectorBindings: [],
        memoryPolicy: {},
        policySnapshotVersion: "v1.0.0",
        status: "active",
        createdAt: new Date(),
        createdBy: "system",
      }
      mockFindFirst.mockResolvedValue(mockRecord)

      const result = await getLatestSnapshot("ws-1", "agent-1")
      expect(result).not.toBeNull()
      expect(result?.snapshotId).toBe("hss-active")
    })
  })

  describe("listSnapshots", () => {
    it("应正确分页返回结果及 total 计数", async () => {
      const mockRecords = [
        {
          snapshotId: "hss-1",
          workspaceId: "ws-1",
          agentId: "agent-1",
          snapshotType: "manual",
          agentConfig: {},
          workflowTemplates: [],
          skillBindings: [],
          connectorBindings: [],
          policySnapshotVersion: "v1.0.0",
          status: "active",
          createdAt: new Date(),
          createdBy: "admin",
        },
      ]
      mockFindMany.mockResolvedValue(mockRecords)
      mockCount.mockResolvedValue(1)

      const result = await listSnapshots("ws-1", "agent-1", {
        status: "active",
        page: 2,
        pageSize: 5,
      })

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          workspaceId: "ws-1",
          agentId: "agent-1",
          status: "active",
        },
        orderBy: { createdAt: "desc" },
        skip: 5,
        take: 5,
      })
      expect(mockCount).toHaveBeenCalledWith({
        where: {
          workspaceId: "ws-1",
          agentId: "agent-1",
          status: "active",
        },
      })

      expect(result.snapshots).toHaveLength(1)
      expect(result.snapshots[0].snapshotId).toBe("hss-1")
      expect(result.total).toBe(1)
    })
  })

  describe("markSnapshotAsRestoredTo", () => {
    it("快照不存在时应抛出 SnapshotNotFoundError", async () => {
      mockFindUnique.mockResolvedValue(null)

      await expect(
        markSnapshotAsRestoredTo("non-existent-snapshot", "restored-by-user")
      ).rejects.toThrow(SnapshotNotFoundError)
    })

    it("快照存在时应正确更新状态为 rolled-back-to 并写入审计日志", async () => {
      const mockRecord = {
        snapshotId: "hss-1",
        workspaceId: "ws-1",
        agentId: "agent-1",
        snapshotType: "pre-canary",
        agentConfig: {},
        workflowTemplates: [],
        skillBindings: [],
        connectorBindings: [],
        policySnapshotVersion: "v1.0.0",
        status: "active",
        createdAt: new Date(),
        createdBy: "system",
      }
      mockFindUnique.mockResolvedValue(mockRecord)

      const mockUpdatedRecord = {
        ...mockRecord,
        status: "rolled-back-to",
        restoredAt: new Date(),
        restoredBy: "restored-by-user",
      }
      mockUpdate.mockResolvedValue(mockUpdatedRecord)

      const result = await markSnapshotAsRestoredTo("hss-1", "restored-by-user")

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { snapshotId: "hss-1" },
      })
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { snapshotId: "hss-1" },
        data: {
          status: "rolled-back-to",
          restoredAt: expect.any(Date),
          restoredBy: "restored-by-user",
        },
      })

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: "restored-by-user",
          action: "harness.snapshot.restored",
          targetType: "agent",
          targetId: "agent-1",
          workspaceId: "ws-1",
        })
      )

      expect(result.status).toBe("rolled-back-to")
      expect(result.restoredBy).toBe("restored-by-user")
    })
  })
})
