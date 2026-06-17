import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route";

// mock auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve({ user: { email: "admin@hermesclaw.ai" } })),
}));

// mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// mock buildWorkspaceContext
vi.mock("@/lib/workspace", () => ({
  buildWorkspaceContext: vi.fn(() =>
    Promise.resolve({
      workspaceId: "ws-test-123",
      role: "ADMIN",
      userId: "u-test-123",
    })
  ),
}));

const mockFindMany = vi.fn();
const mockCount = vi.fn();

// mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: (...args: any[]) => mockFindMany(...args),
      count: (...args: any[]) => mockCount(...args),
    },
    $transaction: vi.fn((promises: any[]) => Promise.all(promises)),
  },
}));

describe("GET /api/audit API 路由测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([
      {
        id: "audit-1",
        actor: "admin@example.com",
        action: "agent.create",
        targetType: "agent",
        targetId: "agent-1",
        triggeredBy: "user",
        status: "success",
        createdAt: new Date("2026-06-06T12:00:00Z"),
      },
    ]);
    mockCount.mockResolvedValue(100);
  });

  it("默认参数时正确加载并进行 workspaceId 隔离", async () => {
    const req = new Request("http://localhost/api/audit");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.logs).toHaveLength(1);
    expect(body.data.total).toBe(100);

    // 默认分页
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-test-123" },
        skip: 0,
        take: 100,
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("正确处理 page 和 limit 分页参数", async () => {
    const req = new Request("http://localhost/api/audit?page=3&limit=20");
    await GET(req);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 40,
        take: 20,
      })
    );
  });

  it("支持对 riskLevel / actor / action / status / targetType 的精准过滤", async () => {
    const req = new Request(
      "http://localhost/api/audit?riskLevel=high&actor=admin@example.com&status=success"
    );
    await GET(req);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "ws-test-123",
          riskLevel: "high",
          actor: "admin@example.com",
          status: "success",
        }),
      })
    );
  });

  it("支持 query 参数进行多字段模糊匹配", async () => {
    const req = new Request("http://localhost/api/audit?query=create");
    await GET(req);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "ws-test-123",
          OR: [
            { actor: { contains: "create" } },
            { action: { contains: "create" } },
            { targetType: { contains: "create" } },
            { detail: { contains: "create" } },
          ],
        }),
      })
    );
  });

  it("当数据库抛错时安全返回 500 错误响应", async () => {
    mockFindMany.mockRejectedValue(new Error("Connection refused"));
    const req = new Request("http://localhost/api/audit");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("服务器内部错误");
  });
});
