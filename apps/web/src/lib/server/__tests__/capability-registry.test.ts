/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  registerCapability,
  resolveCapability,
  recordCapabilityUsage,
  refreshCapabilityHealth,
  yankCapability,
  listCapabilities,
  CapabilityNotFoundError,
  CapabilityAlreadyRegisteredError,
  CapabilityYankedError,
  InvalidVersionError
} from "../capability-registry"
import { prisma } from "@/lib/prisma"

// Mock definitions
const mockFindFirst = vi.fn()
const mockFindUnique = vi.fn()
const mockFindMany = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockCount = vi.fn()

vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    skill: { findUnique: vi.fn() },
    connector: { findUnique: vi.fn() },
    workflow: { findUnique: vi.fn() },
    capabilityVersion: {
      findFirst: (...args: any[]) => mockFindFirst(...args),
      findUnique: (...args: any[]) => mockFindUnique(...args),
      findMany: (...args: any[]) => mockFindMany(...args),
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
      count: (...args: any[]) => mockCount(...args),
    },
    capabilityUsageLog: {
      create: (...args: any[]) => mockCreate(...args),
      findMany: (...args: any[]) => mockFindMany(...args),
    }
  }
  return { prisma: mockPrisma }
})

const mockWriteAuditLog = vi.fn()
vi.mock("@/lib/server/audit", () => ({
  writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args)
}))

describe("Capability Registry Service Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("registerCapability", () => {
    it("应在无效 semver 时抛出 InvalidVersionError", async () => {
      await expect(
        registerCapability({
          capabilityId: "skill-1",
          capabilityType: "skill",
          version: "1.0", // 无效版本
          workspaceId: "ws-1",
          displayName: "Test Skill",
          description: "",
          inputSchema: {},
          outputSchema: {},
          tags: [],
          changelog: "",
          publishedAt: new Date(),
          publishedBy: "system"
        })
      ).rejects.toThrow(InvalidVersionError)
    })

    it("应在能力已被注册时抛出 CapabilityAlreadyRegisteredError", async () => {
      mockFindFirst.mockResolvedValueOnce({ id: "1" }) // 已存在版本

      await expect(
        registerCapability({
          capabilityId: "skill-1",
          capabilityType: "skill",
          version: "1.0.0",
          workspaceId: "ws-1",
          displayName: "Test Skill",
          description: "",
          inputSchema: {},
          outputSchema: {},
          tags: [],
          changelog: "",
          publishedAt: new Date(),
          publishedBy: "system"
        })
      ).rejects.toThrow(CapabilityAlreadyRegisteredError)
    })

    it("应在首个版本且原始底层对象不存在时抛出 CapabilityNotFoundError", async () => {
      mockFindFirst.mockResolvedValueOnce(null) // 无任何注册版本 (首个版本)
      vi.mocked(prisma.skill.findUnique).mockResolvedValueOnce(null) // Skill 不存在

      await expect(
        registerCapability({
          capabilityId: "skill-1",
          capabilityType: "skill",
          version: "1.0.0",
          workspaceId: "ws-1",
          displayName: "Test Skill",
          description: "",
          inputSchema: {},
          outputSchema: {},
          tags: [],
          changelog: "",
          publishedAt: new Date(),
          publishedBy: "system"
        })
      ).rejects.toThrow(CapabilityNotFoundError)
    })

    it("成功注册并写入 AuditLog", async () => {
      mockFindFirst.mockResolvedValueOnce(null) // 首个版本
      vi.mocked(prisma.skill.findUnique).mockResolvedValueOnce({ id: "skill-1" } as any) // Skill 存在

      const mockCreated = {
        capabilityId: "skill-1",
        capabilityType: "skill",
        version: "1.0.0",
        workspaceId: "ws-1",
        displayName: "Test Skill",
        description: "Desc",
        inputSchema: {},
        outputSchema: {},
        tags: "[]",
        status: "active",
        healthStatus: "unknown",
        successCount: 0,
        failureCount: 0,
        avgLatencyMs: 0,
        changelog: "",
        publishedAt: new Date(),
        publishedBy: "system"
      }
      mockCreate.mockResolvedValueOnce(mockCreated)

      const result = await registerCapability({
        capabilityId: "skill-1",
        capabilityType: "skill",
        version: "1.0.0",
        workspaceId: "ws-1",
        displayName: "Test Skill",
        description: "Desc",
        inputSchema: {},
        outputSchema: {},
        tags: [],
        changelog: "",
        publishedAt: new Date(),
        publishedBy: "system"
      })

      expect(result.version).toBe("1.0.0")
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "capability.registered",
          targetId: "skill-1"
        })
      )
    })
  })

  describe("resolveCapability", () => {
    it("未传 version 时应解析为 semver 最高的 active 版本", async () => {
      const versions = [
        { version: "1.2.0", capabilityId: "skill-1", status: "active", workspaceId: "ws-1", tags: "[]", capabilityType: "skill" },
        { version: "1.2.3", capabilityId: "skill-1", status: "active", workspaceId: "ws-1", tags: "[]", capabilityType: "skill" },
        { version: "1.0.9", capabilityId: "skill-1", status: "active", workspaceId: "ws-1", tags: "[]", capabilityType: "skill" }
      ]
      mockFindMany.mockResolvedValueOnce(versions)

      const resolved = await resolveCapability({
        capabilityId: "skill-1",
        capabilityType: "skill",
        workspaceId: "ws-1"
      })

      expect(resolved.registration.version).toBe("1.2.3")
      expect(resolved.skillHandler).toBe("skill-1")
    })

    it("指定 yanked 版本应抛出 CapabilityYankedError", async () => {
      mockFindUnique.mockResolvedValueOnce({
        capabilityId: "skill-1",
        version: "1.0.0",
        status: "yanked",
        workspaceId: "ws-1",
        tags: "[]"
      })

      await expect(
        resolveCapability({
          capabilityId: "skill-1",
          capabilityType: "skill",
          version: "1.0.0",
          workspaceId: "ws-1"
        })
      ).rejects.toThrow(CapabilityYankedError)
    })

    it("指定 deprecated 版本应写 WARNING 审计日志但不抛错", async () => {
      mockFindUnique.mockResolvedValueOnce({
        capabilityId: "skill-1",
        version: "1.0.0",
        status: "deprecated",
        workspaceId: "ws-1",
        tags: "[]",
        capabilityType: "skill"
      })

      const resolved = await resolveCapability({
        capabilityId: "skill-1",
        capabilityType: "skill",
        version: "1.0.0",
        workspaceId: "ws-1"
      })

      expect(resolved.registration.status).toBe("deprecated")
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "capability.warning"
        })
      )
    })
  })

  describe("recordCapabilityUsage", () => {
    it("写入失败不应 throw", async () => {
      mockCreate.mockRejectedValueOnce(new Error("DB Error"))
      
      await expect(
        recordCapabilityUsage({
          capabilityId: "skill-1",
          capabilityType: "skill",
          version: "1.0.0",
          workspaceId: "ws-1",
          status: "success",
          latencyMs: 150
        })
      ).resolves.not.toThrow()
    })
  })

  describe("refreshCapabilityHealth", () => {
    it("无数据时 healthStatus 为 unknown，指标归零", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: "v1", capabilityId: "skill-1", version: "1.0.0", healthStatus: "healthy", workspaceId: "ws-1" }
      ]) // activeVersions
      mockFindMany.mockResolvedValueOnce([]) // usageLogs

      const result = await refreshCapabilityHealth("ws-1")

      expect(result.refreshed).toBe(1)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            healthStatus: "unknown",
            successCount: 0,
            failureCount: 0
          })
        })
      )
    })

    it("高成功率 + 低延迟应被判定为 healthy", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: "v1", capabilityId: "skill-1", version: "1.0.0", healthStatus: "unknown", workspaceId: "ws-1" }
      ])
      // 10 次成功调用，延迟 100ms
      const logs = Array(10).fill({ status: "success", latencyMs: 100 })
      mockFindMany.mockResolvedValueOnce(logs)

      await refreshCapabilityHealth("ws-1")

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            healthStatus: "healthy",
            successCount: 10,
            failureCount: 0
          })
        })
      )
    })

    it("低成功率应被判定为 unhealthy，并写入健康恶化审计日志", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: "v1", capabilityId: "skill-1", version: "1.0.0", healthStatus: "healthy", workspaceId: "ws-1" }
      ])
      // 5 次成功调用，5 次失败调用，且延迟极高
      const logs = [
        ...Array(5).fill({ status: "success", latencyMs: 9000 }),
        ...Array(5).fill({ status: "failure", latencyMs: 9000 })
      ]
      mockFindMany.mockResolvedValueOnce(logs)

      const result = await refreshCapabilityHealth("ws-1")

      expect(result.unhealthy).toBe(1)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            healthStatus: "unhealthy",
            successCount: 5,
            failureCount: 5
          })
        })
      )
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "capability.health.degraded",
          riskLevel: "medium"
        })
      )
    })
  })

  describe("yankCapability", () => {
    it("下线能力后阻断后续 resolveCapability 并写入高危审计", async () => {
      mockFindUnique.mockResolvedValueOnce({
        capabilityId: "skill-1",
        version: "1.0.0",
        workspaceId: "ws-1",
        tags: "[]"
      })
      mockUpdate.mockResolvedValueOnce({
        capabilityId: "skill-1",
        version: "1.0.0",
        workspaceId: "ws-1",
        status: "yanked",
        tags: "[]"
      })

      const yanked = await yankCapability("skill-1", "1.0.0", "Security Vulnerability", "admin")
      expect(yanked.status).toBe("yanked")
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "capability.yanked",
          riskLevel: "high"
        })
      )
    })
  })

  describe("listCapabilities", () => {
    it("按 tags 过滤与分页正确", async () => {
      mockFindMany.mockResolvedValueOnce([
        { capabilityId: "skill-1", version: "1.0.0", workspaceId: "ws-1", tags: '["trade", "security"]' }
      ])
      mockCount.mockResolvedValueOnce(1)

      const result = await listCapabilities("ws-1", {
        tags: ["trade"],
        page: 1,
        pageSize: 10
      })

      expect(result.total).toBe(1)
      expect(result.capabilities[0].tags).toContain("trade")
    })
  })
})
