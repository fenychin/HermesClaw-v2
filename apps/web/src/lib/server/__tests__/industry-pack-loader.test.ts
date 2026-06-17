/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  installPack,
  uninstallPack,
  satisfiesSemver,
  PackManifestInvalidError,
  PackAlreadyInstalledError,
  PackDependencyNotMetError,
  PackInstallationNotFoundError,
  PackCoreVersionIncompatibleError
} from "../industry-pack-loader"
import { validateManifest } from "@hermesclaw/event-contracts"
import { CapabilityAlreadyRegisteredError } from "../capability-registry"
import { prisma } from "@/lib/prisma"

vi.mock("../capability-registry", () => {
  class CapabilityAlreadyRegisteredError extends Error {
    constructor(capabilityId: string, version: string) {
      super(`Capability ${capabilityId}@${version} already registered`)
      this.name = 'CapabilityAlreadyRegisteredError'
    }
  }
  return {
    CapabilityAlreadyRegisteredError,
    registerCapability: vi.fn(),
    deprecateCapability: vi.fn()
  }
})

vi.mock("../audit", () => ({
  writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args),
  actorFromSession: () => Promise.resolve("system"),
}))

// Mock prisma methods
const mockFindFirst = vi.fn()
const mockFindMany = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockCount = vi.fn()
const mockFindUnique = vi.fn()

vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    industryPackInstallation: {
      findFirst: (...args: any[]) => mockFindFirst(...args),
      findMany: (...args: any[]) => mockFindMany(...args),
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
      count: (...args: any[]) => mockCount(...args),
    },
    skill: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
    connector: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
    workflow: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
    capabilityVersion: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
    }
  }
  return { prisma: mockPrisma }
})

const mockWriteAuditLog = vi.fn()
const mockRegisterCapability = vi.fn()
const mockDeprecateCapability = vi.fn()
const mockGetSystemVersion = vi.fn().mockReturnValue("1.0.0")

const testDeps = {
  prisma,
  writeAuditLog: mockWriteAuditLog,
  getSystemVersion: mockGetSystemVersion,
  registerCapability: mockRegisterCapability,
  deprecateCapability: mockDeprecateCapability
}

const validManifest = {
  manifestVersion: "1.0",
  packId: "test-pack",
  packName: "Test Pack",
  packVersion: "1.0.0",
  description: "Test Pack Description",
  author: "Antigravity",
  license: "MIT",
  tags: ["test"],
  targetIndustry: "general",
  minHarnessCoreVersion: "1.0.0",
  changelog: "Initial version",
  capabilities: [
    {
      id: "skill-1",
      type: "skill",
      displayName: "Test Skill",
      description: "Test Skill Desc",
      version: "1.0.0",
      inputSchema: {},
      outputSchema: {},
      tags: ["test"],
      changelog: "init"
    }
  ],
  dependencies: []
}

describe("Industry Pack Manifest Validation Tests", () => {
  it("validateManifest 合法 Manifest 返回 valid: true", () => {
    const result = validateManifest(validManifest)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  it("validateManifest 缺少 packId 返回 errors", () => {
    const broken = { ...validManifest, packId: "" }
    const result = validateManifest(broken)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("packId is required and must be a non-empty string")
  })

  it("validateManifest 无效 semver 返回 errors", () => {
    const broken = { ...validManifest, packVersion: "1.0" }
    const result = validateManifest(broken)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("packVersion is required and must be a valid semver string")
  })

  it("validateManifest 重复 capability.id 返回 errors", () => {
    const broken = {
      ...validManifest,
      capabilities: [
        { ...validManifest.capabilities[0], id: "skill-1" },
        { ...validManifest.capabilities[0], id: "skill-1" }
      ]
    }
    const result = validateManifest(broken)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Duplicate capability id: skill-1")
  })

  it("validateManifest dependencies 循环引用自身返回 errors", () => {
    const broken = {
      ...validManifest,
      dependencies: [
        { packId: "test-pack", version: ">=1.0.0", required: true }
      ]
    }
    const result = validateManifest(broken)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Dependency cannot self-reference packId: test-pack")
  })
})

describe("Industry Pack Loader Service Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSystemVersion.mockReturnValue("1.0.0")
    mockCreate.mockImplementation((args: any) => Promise.resolve({ id: "inst-1", ...args.data }))
    mockUpdate.mockImplementation((args: any) => Promise.resolve({ id: args.where?.id || "inst-1", ...args.data }))
  })

  describe("installPack", () => {
    it("installPack 成功安装，所有 capabilities 注册到 Registry", async () => {
      mockFindFirst.mockResolvedValueOnce(null) // 没有安装过的记录
      mockCreate.mockResolvedValueOnce({ id: "inst-1" }) // 创建安装记录
      mockFindUnique.mockResolvedValue(null) // 组件不存在，创建它
      mockRegisterCapability.mockResolvedValue({})

      const result = await installPack(validManifest as any, "ws-1", "admin", testDeps)

      expect(result).toBeDefined()
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            packId: "test-pack",
            status: "installing"
          })
        })
      )
      expect(mockRegisterCapability).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "installed"
          })
        })
      )
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "pack.installed"
        })
      )
    })

    it("installPack Manifest 无效时抛出 PackManifestInvalidError，不写 DB", async () => {
      const broken = { ...validManifest, packId: "" }
      await expect(installPack(broken as any, "ws-1", "admin", testDeps)).rejects.toThrow(
        PackManifestInvalidError
      )
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it("installPack 重复安装抛出 PackAlreadyInstalledError", async () => {
      mockFindFirst.mockResolvedValueOnce({ id: "inst-1", status: "installed" }) // 已有安装记录

      await expect(installPack(validManifest as any, "ws-1", "admin", testDeps)).rejects.toThrow(
        PackAlreadyInstalledError
      )
    })

    it("installPack 核心系统版本不满足抛出 PackCoreVersionIncompatibleError", async () => {
      mockFindFirst.mockResolvedValueOnce(null)
      mockGetSystemVersion.mockReturnValue("0.9.0") // 核心版本 0.9.0，而要求 1.0.0

      await expect(installPack(validManifest as any, "ws-1", "admin", testDeps)).rejects.toThrow(
        PackCoreVersionIncompatibleError
      )
    })

    it("installPack 依赖未满足抛出 PackDependencyNotMetError", async () => {
      mockFindFirst.mockResolvedValueOnce(null) // 当前包没有安装
      // 依赖包 "dep-pack"
      const manifestWithDep = {
        ...validManifest,
        dependencies: [{ packId: "dep-pack", version: ">=1.0.0", required: true }]
      }
      mockFindFirst.mockResolvedValueOnce(null) // 依赖包也未安装，返回 null

      await expect(installPack(manifestWithDep as any, "ws-1", "admin", testDeps)).rejects.toThrow(
        PackDependencyNotMetError
      )
    })

    it("installPack capability 注册失败（非幂等错误）→ 回滚已注册能力，status='failed'", async () => {
      mockFindFirst.mockResolvedValueOnce(null)
      mockCreate.mockResolvedValueOnce({ id: "inst-1" })
      mockFindUnique.mockResolvedValue(null)
      
      const twoCapsManifest = {
        ...validManifest,
        capabilities: [
          { ...validManifest.capabilities[0], id: "skill-1" },
          { ...validManifest.capabilities[0], id: "skill-2" }
        ]
      }

      // 第一次成功，第二次抛错
      mockRegisterCapability
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("Database drop"))

      await expect(installPack(twoCapsManifest as any, "ws-1", "admin", testDeps)).rejects.toThrow(
        "Database drop"
      )

      // 验证是否调用了回滚（回滚了 skill-1）
      expect(mockDeprecateCapability).toHaveBeenCalledWith(
        "skill-1",
        "1.0.0",
        expect.any(String),
        "admin",
        expect.any(Object)
      )
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            errorMessage: "Database drop"
          })
        })
      )
    })

    it("installPack capability CapabilityAlreadyRegisteredError → 写 warning，跳过，继续安装", async () => {
      mockFindFirst.mockResolvedValueOnce(null)
      mockCreate.mockResolvedValueOnce({ id: "inst-1" })
      mockFindUnique.mockResolvedValue(null)
      // 模拟抛出 CapabilityAlreadyRegisteredError
      mockRegisterCapability.mockRejectedValueOnce(
        new CapabilityAlreadyRegisteredError("skill-1", "1.0.0")
      )

      const result = await installPack(validManifest as any, "ws-1", "admin", testDeps)

      expect(result).toBeDefined()
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "installed"
          })
        })
      )
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "pack.install.warning",
          targetId: "skill-1"
        })
      )
    })
  })

  describe("uninstallPack", () => {
    it("uninstallPack 成功卸载，所有 capabilities 标记为 deprecated", async () => {
      mockFindFirst.mockResolvedValueOnce({
        id: "inst-1",
        packId: "test-pack",
        packVersion: "1.0.0",
        status: "installed",
        installedCapabilities: JSON.stringify(["skill-1@1.0.0"])
      })

      const result = await uninstallPack("test-pack", "1.0.0", "ws-1", "admin", testDeps)

      expect(result).toBeDefined()
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "uninstalling"
          })
        })
      )
      expect(mockDeprecateCapability).toHaveBeenCalledWith(
        "skill-1",
        "1.0.0",
        "Pack test-pack@1.0.0 uninstalled",
        "admin",
        expect.any(Object)
      )
      expect(mockUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "uninstalled",
            uninstalledBy: "admin"
          })
        })
      )
    })

    it("uninstallPack Pack 未安装时抛出 PackInstallationNotFoundError", async () => {
      mockFindFirst.mockResolvedValueOnce(null)

      await expect(uninstallPack("test-pack", "1.0.0", "ws-1", "admin", testDeps)).rejects.toThrow(
        PackInstallationNotFoundError
      )
    })
  })

  describe("satisfiesSemver helper utility", () => {
    it("应该正确判断范围满足情况", () => {
      expect(satisfiesSemver("1.0.0", ">=1.0.0 <2.0.0")).toBe(true)
      expect(satisfiesSemver("2.0.0", ">=1.0.0 <2.0.0")).toBe(false)
      expect(satisfiesSemver("1.5.0", ">=1.0.0")).toBe(true)
      expect(satisfiesSemver("0.9.0", ">=1.0.0")).toBe(false)
      expect(satisfiesSemver("1.0.0", "1.0.0")).toBe(true)
      expect(satisfiesSemver("1.0.1", "1.0.0")).toBe(false)
    })
  })
})
