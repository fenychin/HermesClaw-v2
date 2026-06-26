import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryService } from "../memory-service";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "../audit";

// ==============================
// Prisma Mock Setup
// ==============================
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    memory: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
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
// Audit Log Mock Setup
// ==============================
vi.mock("../audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// ==============================
// API Handler wrapper mock
// ==============================
vi.mock("@/lib/server/api-handler", () => {
  return {
    withRBAC: (handler: any) => {
      return async (req: Request, routeContext: any) => {
        return handler(req, {
          workspaceId: "ws-1",
          userId: "user-1",
          role: "ADMIN",
        });
      };
    },
  };
});

// Import API routes now that their wrappers are mocked
import { GET, POST, PATCH, DELETE } from "../../../app/api/brain/memory/route";

describe("Memory CRUD and Lifecycle Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockPrisma = prisma as any;
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));
  });

  describe("MemoryService Direct Logic", () => {
    it("should call createMemory and insert into DB and revision, writing direct audit log", async () => {
      const mockCreated = {
        id: "mem-uuid-1",
        workspaceId: "ws-1",
        type: "mid",
        content: "Mid term contents",
        summary: "Mid summary",
        status: "active",
      };
      mockCreate.mockResolvedValue(mockCreated);

      const result = await MemoryService.createMemory(
        "ws-1",
        {
          type: "mid",
          content: "Mid term contents",
          summary: "Mid summary",
          source: "user",
        },
        "user-1"
      );

      expect(result).toEqual(mockCreated);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: "ws-1",
            type: "mid",
            content: "Mid term contents",
            summary: "Mid summary",
            version: 1,
            status: "active",
          }),
        })
      );
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "create.memory",
          targetId: "mem-uuid-1",
        })
      );
    });

    it("should list active and frozen memories, but filter out deprecated memories", async () => {
      mockFindMany.mockResolvedValue([
        { id: "mem-1", type: "mid", status: "active", revisions: [] },
      ]);

      const result = await MemoryService.listMemories("ws-1", "mid", 1, 20);

      expect(result).toHaveLength(1);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          workspaceId: "ws-1",
          type: "mid",
          status: { not: "deprecated" },
        },
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 20,
        include: {
          revisions: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
    });

    it("should physically delete memory for short term memory", async () => {
      mockDelete.mockResolvedValue({ id: "mem-short", type: "short" });

      await MemoryService.hardDeleteMemory("mem-short", "ws-1");

      expect(mockDelete).toHaveBeenCalledWith({
        where: { id: "mem-short", workspaceId: "ws-1" },
      });
    });

    it("should soft delete memory by changing status to deprecated for mid/long term memories", async () => {
      mockUpdate.mockResolvedValue({ id: "mem-mid", type: "mid", status: "deprecated" });

      await MemoryService.softDeleteMemory("mem-mid", "ws-1");

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "mem-mid", workspaceId: "ws-1" },
        data: { status: "deprecated" },
      });
    });
  });

  describe("Memory API Handlers", () => {
    it("should handle GET list request", async () => {
      mockFindMany.mockResolvedValue([
        {
          id: "m-1",
          type: "mid",
          content: "Content",
          summary: "Summary",
          source: "user",
          relatedProject: null,
          relatedAgent: null,
          confidence: 0.8,
          frozen: false,
          tags: JSON.stringify(["test"]),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          revisions: [],
        },
      ]);

      const req = new Request("http://localhost/api/brain/memory?type=mid");
      const res = await GET(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.memories).toHaveLength(1);
      expect(data.data.memories[0].tags).toEqual(["test"]);
    });

    it("should handle POST request and write audit log with top-level workflowRunId: undefined", async () => {
      const mockCreated = {
        id: "m-new",
        workspaceId: "ws-1",
        type: "short",
        content: "New content",
        summary: "New summary",
        status: "active",
      };
      mockCreate.mockResolvedValue(mockCreated);

      const req = new Request("http://localhost/api/brain/memory", {
        method: "POST",
        body: JSON.stringify({
          type: "short",
          content: "New content",
          summary: "New summary",
          source: "user",
        }),
      });

      const res = await POST(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.memory.id).toBe("m-new");

      // Verify AuditLog contains workflowRunId as top level field (it should be undefined/null, but present at top-level)
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "memory.created",
          workflowRunId: undefined,
        })
      );
    });

    it("should handle DELETE for short term memory with physical deletion", async () => {
      mockFindUnique.mockResolvedValue({
        id: "mem-short",
        workspaceId: "ws-1",
        type: "short",
        summary: "Short Summary",
      });

      mockDelete.mockResolvedValue({ id: "mem-short" });

      const req = new Request("http://localhost/api/brain/memory?id=mem-short", {
        method: "DELETE",
      });

      const res = await DELETE(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockDelete).toHaveBeenCalledWith({
        where: { id: "mem-short", workspaceId: "ws-1" },
      });
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "memory.deleted",
          workflowRunId: undefined,
        })
      );
    });

    it("should handle DELETE for mid/long term memory with soft deletion", async () => {
      mockFindUnique.mockResolvedValue({
        id: "mem-mid",
        workspaceId: "ws-1",
        type: "mid",
        summary: "Mid Summary",
      });

      mockUpdate.mockResolvedValue({ id: "mem-mid", status: "deprecated" });

      const req = new Request("http://localhost/api/brain/memory?id=mem-mid", {
        method: "DELETE",
      });

      const res = await DELETE(req, {});
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "mem-mid", workspaceId: "ws-1" },
        data: { status: "deprecated" },
      });
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "memory.deleted",
          workflowRunId: undefined,
        })
      );
    });
  });
});
