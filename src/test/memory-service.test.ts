import { describe, it, expect, vi, beforeEach } from "vitest"
import { MemoryService } from "@/lib/server/memory-service"

// ---- Mock 审计日志写入接口 ----
vi.mock("@/lib/server/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

// ---- Mock prisma 依赖 ----
const mockMemoryCreate = vi.fn()
const mockMemoryUpdate = vi.fn()
const mockMemoryFindUnique = vi.fn()
const mockMemoryDelete = vi.fn()
const mockRevisionCreate = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (cb) => {
      // 模拟 transaction 事务，直接传递包含各表操作 mock 的宿主对象
      const tx = {
        memory: {
          create: (...args: unknown[]) => mockMemoryCreate(...args),
          update: (...args: unknown[]) => mockMemoryUpdate(...args),
          findUnique: (...args: unknown[]) => mockMemoryFindUnique(...args),
          delete: (...args: unknown[]) => mockMemoryDelete(...args),
        },
        memoryRevision: {
          create: (...args: unknown[]) => mockRevisionCreate(...args),
        },
      }
      return cb(tx)
    }),
  },
}))

describe("MemoryService 记忆版本化与 KCL 事务服务测试", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("createMemory", () => {
    it("在创建记忆时，必须以事务的形式同时写入 Memory 表与首个 Revision 版本记录", async () => {
      const mockResult = {
        id: "mem-123",
        workspaceId: "ws-test",
        type: "mid",
        content: "这是中期记忆测试内容",
        summary: "记忆测试",
        source: "system",
        confidence: 0.9,
        frozen: false,
        tags: "[]",
        projectId: null,
        version: 1,
        status: "active",
      }

      mockMemoryCreate.mockResolvedValue(mockResult)

      const input = {
        type: "mid",
        content: "这是中期记忆测试内容",
        summary: "记忆测试",
        source: "system",
        confidence: 0.9,
        tags: [],
      }

      const result = await MemoryService.createMemory("ws-test", input, "admin@hermesclaw.ai")

      // 1. 验证 Memory 表被成功调用创建
      expect(mockMemoryCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "ws-test",
          type: "mid",
          content: "这是中期记忆测试内容",
          version: 1,
          status: "active",
        }),
      })

      // 2. 验证首版修订历史在同一个事务中原子写入且版本为 1 (KCL 机制落地)
      expect(mockRevisionCreate).toHaveBeenCalledWith({
        data: {
          workspaceId: "ws-test",
          memoryId: "mem-123",
          version: 1,
          content: "这是中期记忆测试内容",
          summary: "记忆测试",
          confidence: 0.9,
          editedBy: "admin@hermesclaw.ai",
          reason: "初始创建",
          proposalId: null,
        },
      })

      expect(result).toEqual(mockResult)
    })
  })

  describe("updateMemory", () => {
    it("对于 mid 级别的记忆，如果发生了内容变更，必须先对旧内容拍摄 revision 快照，且最新 Memory 的 version 原子递增", async () => {
      // 模拟已存在的中期记忆
      const existing = {
        id: "mem-mid-999",
        workspaceId: "ws-test",
        type: "mid",
        content: "旧内容",
        summary: "旧摘要",
        confidence: 0.8,
        version: 2,
      }

      mockMemoryFindUnique.mockResolvedValue(existing)
      mockMemoryUpdate.mockResolvedValue({
        ...existing,
        content: "新内容",
        version: 3,
      })

      const updateInput = {
        content: "新内容",
        reason: "修改了客户核心需求",
      }

      await MemoryService.updateMemory("ws-test", "mem-mid-999", updateInput, "admin@hermesclaw.ai")

      // 1. 验证先对旧的 v2 版本拍摄快照并归档原因 (KCL)
      expect(mockRevisionCreate).toHaveBeenCalledWith({
        data: {
          workspaceId: "ws-test",
          memoryId: "mem-mid-999",
          version: 2,
          content: "旧内容",
          summary: "旧摘要",
          confidence: 0.8,
          editedBy: "admin@hermesclaw.ai",
          reason: "修改了客户核心需求",
          proposalId: null,
        },
      })

      // 2. 验证 Memory 更新的最新记录中版本原子递增为 3
      expect(mockMemoryUpdate).toHaveBeenCalledWith({
        where: { id: "mem-mid-999" },
        data: {
          content: "新内容",
          version: 3,
        },
      })
    })

    it("对于 short 级别的记忆，即便发生内容性变动，也绝不进行快照和版本累加（以节省开销）", async () => {
      const existing = {
        id: "mem-short-111",
        workspaceId: "ws-test",
        type: "short",
        content: "短期旧内容",
        version: 1,
      }

      mockMemoryFindUnique.mockResolvedValue(existing)
      mockMemoryUpdate.mockResolvedValue({
        ...existing,
        content: "短期新内容",
      })

      const updateInput = {
        content: "短期新内容",
      }

      await MemoryService.updateMemory("ws-test", "mem-short-111", updateInput, "admin@hermesclaw.ai")

      // 1. 验证没有创建任何修订历史快照
      expect(mockRevisionCreate).not.toHaveBeenCalled()

      // 2. 验证 Memory 被更新，但 version 依然保留原值，不进行自增
      expect(mockMemoryUpdate).toHaveBeenCalledWith({
        where: { id: "mem-short-111" },
        data: {
          content: "短期新内容",
        },
      })
    })

    it("当非内容性字段更新时（例如仅修改 frozen 状态），即便为 mid 级别记忆也不触发版本化", async () => {
      const existing = {
        id: "mem-mid-222",
        workspaceId: "ws-test",
        type: "mid",
        content: "内容",
        summary: "摘要",
        confidence: 0.8,
        version: 1,
        frozen: false,
      }

      mockMemoryFindUnique.mockResolvedValue(existing)

      await MemoryService.updateMemory("ws-test", "mem-mid-222", { frozen: true }, "admin@hermesclaw.ai")

      expect(mockRevisionCreate).not.toHaveBeenCalled()
      expect(mockMemoryUpdate).toHaveBeenCalledWith({
        where: { id: "mem-mid-222" },
        data: {
          frozen: true,
        },
      })
    })

    it("在更新时，如果跨 workspace 越权访问，应该直接抛错阻止事务", async () => {
      const existing = {
        id: "mem-mid-333",
        workspaceId: "ws-real",
        type: "mid",
      }

      mockMemoryFindUnique.mockResolvedValue(existing)

      await expect(
        MemoryService.updateMemory("ws-fake-attack", "mem-mid-333", { content: "入侵内容" }, "hacker@evil.com")
      ).rejects.toThrow("Unauthorized workspace access")

      expect(mockMemoryUpdate).not.toHaveBeenCalled()
    })
  })

  describe("deleteMemory", () => {
    it("删除已存在且属于当前 workspace 的记忆时能够原子删除", async () => {
      const existing = {
        id: "mem-del-123",
        workspaceId: "ws-test",
        type: "mid",
        summary: "删除测试",
      }
      mockMemoryFindUnique.mockResolvedValue(existing)

      await MemoryService.deleteMemory("ws-test", "mem-del-123", "admin@hermesclaw.ai")

      expect(mockMemoryDelete).toHaveBeenCalledWith({
        where: { id: "mem-del-123" },
      })
    })

    it("删除越权跨 workspace 记忆时抛错阻断", async () => {
      const existing = {
        id: "mem-del-123",
        workspaceId: "ws-other",
        type: "mid",
        summary: "删除越权测试",
      }
      mockMemoryFindUnique.mockResolvedValue(existing)

      await expect(
        MemoryService.deleteMemory("ws-test", "mem-del-123", "admin@hermesclaw.ai")
      ).rejects.toThrow("Unauthorized workspace access")

      expect(mockMemoryDelete).not.toHaveBeenCalled()
    })
  })
})
