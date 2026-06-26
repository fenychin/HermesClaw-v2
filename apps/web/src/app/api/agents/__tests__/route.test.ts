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

// mock workspace
vi.mock("@/lib/workspace", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workspace-roles")>("@/lib/workspace-roles");
  return {
    ...actual,
    buildWorkspaceContext: vi.fn(() =>
      Promise.resolve({
        workspaceId: "ws-test-123",
        role: "ADMIN",
        userId: "u-test-123",
      })
    ),
    ForbiddenError: class extends Error {},
  };
});

const mockFindMany = vi.fn();
const mockGroupBy = vi.fn();
const mockSkillBindingFindMany = vi.fn();

// mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    agent: {
      findMany: (...args: any[]) => mockFindMany(...args),
    },
    workflowRun: {
      groupBy: (...args: any[]) => mockGroupBy(...args),
    },
    skillBinding: {
      findMany: (...args: any[]) => mockSkillBindingFindMany(...args),
    },
  },
}));

vi.mock("@/lib/server/agent-serializer", () => ({
  serializeAgent: (agent: any) => agent,
}));

vi.mock("@/lib/server/audit", () => ({
  actorFromSession: vi.fn(() => Promise.resolve("admin@hermesclaw.ai")),
  writeAuditLog: vi.fn(() => Promise.resolve({})),
}));

describe("GET /api/agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([]);
  });

  it("无 skillId 时按 workspaceId 查询", async () => {
    const req = new Request("http://localhost/api/agents");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-test-123" },
      })
    );
  });

  it("有 skillId 时通过 SkillBinding 过滤 Agent", async () => {
    mockSkillBindingFindMany.mockResolvedValue([
      { agentId: "agent-1" },
      { agentId: "agent-2" },
    ]);
    mockFindMany.mockResolvedValue([
      { id: "agent-1", name: "Agent A" },
      { id: "agent-2", name: "Agent B" },
    ]);

    const req = new Request("http://localhost/api/agents?skillId=skill-1");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockSkillBindingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { skillId: "skill-1", workspaceId: "ws-test-123" },
        select: { agentId: true },
      })
    );
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "ws-test-123",
          id: { in: ["agent-1", "agent-2"] },
        },
      })
    );
    expect(body.data.agents).toHaveLength(2);
  });

  it("skillId 无绑定时返回空数组", async () => {
    mockSkillBindingFindMany.mockResolvedValue([]);

    const req = new Request("http://localhost/api/agents?skillId=skill-empty");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.agents).toEqual([]);
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
