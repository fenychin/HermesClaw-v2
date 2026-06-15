import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryService } from "../memory-service";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "../audit";
import { callDeepSeekJson } from "../llm-provider";

// ==============================
// Prisma 模拟设置
// ==============================
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();

vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    memory: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    memoryRevision: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
  };

  mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));

  return {
    prisma: mockPrisma,
  };
});

// ==============================
// 审计日志与 LLM Mock
// ==============================
vi.mock("../audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../llm-provider", () => ({
  resolveLlmProvider: () => ({ provider: "deepseek", model: "deepseek-chat" }),
  callDeepSeekJson: vi.fn(),
}));

describe("MemoryService Extended Tests - Multi-layered Memory Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockPrisma = prisma as any;
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));
  });

  describe("compressMemories (Mid-term to Long-term Compression)", () => {
    it("should return null if there are no active mid memories", async () => {
      mockFindMany.mockResolvedValue([]);
      const result = await MemoryService.compressMemories("ws-1", "proj-1", "user-1");
      expect(result).toBeNull();
      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          workspaceId: "ws-1",
          projectId: "proj-1",
          type: "mid",
          status: "active",
          frozen: false,
        },
      });
    });

    it("should successfully compress mid memories into long memory using LLM", async () => {
      const midMemories = [
        { id: "m-1", summary: "Mid Summary 1", content: "Mid Content 1" },
        { id: "m-2", summary: "Mid Summary 2", content: "Mid Content 2" },
      ];
      mockFindMany.mockResolvedValue(midMemories);

      const mockLlmResponse = {
        summary: "Compressed Long Summary from LLM",
        content: "Compressed Long Content from LLM",
      };
      vi.mocked(callDeepSeekJson).mockResolvedValue(mockLlmResponse);

      const mockCreatedLong = {
        id: "long-uuid-123",
        workspaceId: "ws-1",
        type: "long",
        summary: "Compressed Long Summary from LLM",
        content: "Compressed Long Content from LLM",
        status: "active",
      };
      mockCreate.mockResolvedValue(mockCreatedLong);

      const result = await MemoryService.compressMemories("ws-1", "proj-1", "user-1");

      // Verify mid memories archive
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["m-1", "m-2"] } },
        data: { status: "archived" },
      });

      // Verify long memory creation
      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "ws-1",
          type: "long",
          summary: "Compressed Long Summary from LLM",
          content: "Compressed Long Content from LLM",
          source: "system",
          confidence: 0.9,
          status: "active",
        }),
      });

      // Verify audit log
      expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        actor: "user-1",
        action: "compress.memory",
        targetType: "memory",
        detail: expect.stringContaining("Compressed Long Summary from LLM"),
      }));

      expect(result).toEqual(mockCreatedLong);
    });

    it("should downgrade to string concatenation rules when LLM calls fail", async () => {
      const midMemories = [
        { id: "m-1", summary: "Mid Summary 1", content: "Mid Content 1" },
        { id: "m-2", summary: "Mid Summary 2", content: "Mid Content 2" },
      ];
      mockFindMany.mockResolvedValue(midMemories);

      vi.mocked(callDeepSeekJson).mockRejectedValue(new Error("API Overloaded"));

      const mockCreatedLong = {
        id: "long-uuid-123",
        workspaceId: "ws-1",
        type: "long",
        summary: "项目记忆合并升格 (proj-1)",
        content: "本条长期记忆是由中期记忆合并提炼生成：\n- [Mid Summary 1] Mid Content 1\n- [Mid Summary 2] Mid Content 2",
        status: "active",
      };
      mockCreate.mockResolvedValue(mockCreatedLong);

      const result = await MemoryService.compressMemories("ws-1", "proj-1", "user-1");

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["m-1", "m-2"] } },
        data: { status: "archived" },
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "ws-1",
          type: "long",
          summary: "项目记忆合并升格 (proj-1)",
          content: expect.stringContaining("- [Mid Summary 1] Mid Content 1"),
          source: "system",
          confidence: 0.9,
          status: "active",
        }),
      });

      expect(result).toEqual(mockCreatedLong);
    });
  });

  describe("mergeDuplicateMemories (Long-term Semantic Merging)", () => {
    it("should return null if there are fewer than 2 active long memories", async () => {
      mockFindMany.mockResolvedValue([{ id: "l-1", type: "long", status: "active" }]);
      const result = await MemoryService.mergeDuplicateMemories("ws-1", "user-1");
      expect(result).toBeNull();
      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          workspaceId: "ws-1",
          type: "long",
          status: "active",
          frozen: false,
        },
      });
    });

    it("should successfully merge duplicate long memories using LLM", async () => {
      const longMemories = [
        { id: "l-1", summary: "Long Summary 1", content: "Long Content 1" },
        { id: "l-2", summary: "Long Summary 2", content: "Long Content 2" },
      ];
      mockFindMany.mockResolvedValue(longMemories);

      const mockLlmResponse = {
        merged: [
          {
            summary: "Merged Long Summary from LLM",
            content: "Merged Long Content from LLM",
            mergedFromIds: ["l-1", "l-2"],
          },
        ],
      };
      vi.mocked(callDeepSeekJson).mockResolvedValue(mockLlmResponse);

      const mockCreatedMerged = {
        id: "long-merged-uuid",
        workspaceId: "ws-1",
        type: "long",
        summary: "Merged Long Summary from LLM",
        content: "Merged Long Content from LLM",
        status: "active",
      };
      mockCreate.mockResolvedValue(mockCreatedMerged);

      const result = await MemoryService.mergeDuplicateMemories("ws-1", "user-1");

      // Verify merged original memories archive
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["l-1", "l-2"] } },
        data: { status: "archived" },
      });

      // Verify merged long memory creation
      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "ws-1",
          type: "long",
          summary: "Merged Long Summary from LLM",
          content: "Merged Long Content from LLM",
          source: "system",
          confidence: 0.9,
          status: "active",
        }),
      });

      // Verify audit log
      expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        actor: "user-1",
        action: "merge.memory",
        targetType: "memory",
        detail: expect.stringContaining("成功对 2 条冗余长期记忆进行去重与融合。"),
      }));

      expect(result).toEqual([mockCreatedMerged]);
    });

    it("should fallback to merging last two long memories when LLM calls fail", async () => {
      const longMemories = [
        { id: "l-1", summary: "Long Summary 1", content: "Long Content 1" },
        { id: "l-2", summary: "Long Summary 2", content: "Long Content 2" },
      ];
      mockFindMany.mockResolvedValue(longMemories);

      vi.mocked(callDeepSeekJson).mockRejectedValue(new Error("JSON Parse Error"));

      const mockCreatedMerged = {
        id: "long-merged-uuid",
        workspaceId: "ws-1",
        type: "long",
        summary: "融合记忆: Long Summary 1 & Long Summary 2",
        content: "这是由以下冗余长期记忆语义去重融合而成：\n1. Long Content 1\n2. Long Content 2",
        status: "active",
      };
      mockCreate.mockResolvedValue(mockCreatedMerged);

      const result = await MemoryService.mergeDuplicateMemories("ws-1", "user-1");

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["l-1", "l-2"] } },
        data: { status: "archived" },
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "ws-1",
          type: "long",
          summary: "融合记忆: Long Summary 1 & Long Summary 2",
          content: expect.stringContaining("这是由以下冗余长期记忆语义去重融合而成："),
          source: "system",
          confidence: 0.9,
          status: "active",
        }),
      });

      expect(result).toEqual([mockCreatedMerged]);
    });
  });
});
