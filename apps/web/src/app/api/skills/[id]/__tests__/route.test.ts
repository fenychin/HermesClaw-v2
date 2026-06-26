import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, PUT, DELETE } from "../route";

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
  };
});

// mock skills service
const mockGetSkillById = vi.fn();
const mockUpdateSkillRecord = vi.fn();
const mockDeleteSkillRecord = vi.fn();

vi.mock("@/lib/server/skills", () => ({
  getSkillById: (...args: any[]) => mockGetSkillById(...args),
  updateSkillRecord: (...args: any[]) => mockUpdateSkillRecord(...args),
  deleteSkillRecord: (...args: any[]) => mockDeleteSkillRecord(...args),
}));

// mock audit
vi.mock("@/lib/server/audit", () => ({
  createAuditEntry: vi.fn(() => Promise.resolve({ auditId: "audit-1" })),
  updateAuditEntry: vi.fn(() => Promise.resolve({})),
  actorFromSession: vi.fn(() => Promise.resolve("admin@hermesclaw.ai")),
  writeAuditLog: vi.fn(() => Promise.resolve({})),
}));

// mock fs
const mockExistsSync = vi.fn();
const mockStatSync = vi.fn();
const mockReaddirSync = vi.fn();

vi.mock("fs", () => ({
  existsSync: (...args: any[]) => mockExistsSync(...args),
  statSync: (...args: any[]) => mockStatSync(...args),
  readdirSync: (...args: any[]) => mockReaddirSync(...args),
}));

function createRouteContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/skills/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSkillById.mockResolvedValue({
      id: "skill-1",
      name: "test-skill",
      workspaceId: "ws-test-123",
      source: "CUSTOM",
    });
  });

  it("目录不存在时返回 SKILL.md fallback 并记录 warn", async () => {
    mockExistsSync.mockReturnValue(false);

    const req = new Request("http://localhost/api/skills/skill-1");
    const res = await GET(req, createRouteContext("skill-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.skill.fileTree).toEqual([{ path: "SKILL.md", type: "file" }]);
  });

  it("目录存在时返回真实文件树", async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
    });
    mockReaddirSync.mockReturnValue(["SKILL.md"]);

    const req = new Request("http://localhost/api/skills/skill-1");
    const res = await GET(req, createRouteContext("skill-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.skill.fileTree).toEqual([{ path: "SKILL.md", type: "file" }]);
  });
});

describe("PUT /api/skills/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("BUILTIN 技能返回 403", async () => {
    mockGetSkillById.mockResolvedValue({
      id: "skill-builtin",
      name: "builtin-skill",
      workspaceId: "ws-test-123",
      source: "BUILTIN",
    });

    const req = new Request("http://localhost/api/skills/skill-builtin", {
      method: "PUT",
      body: JSON.stringify({ description: "updated" }),
    });
    const res = await PUT(req, createRouteContext("skill-builtin"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe("内置技能不可修改");
    expect(mockUpdateSkillRecord).not.toHaveBeenCalled();
  });

  it("CUSTOM 技能可正常更新", async () => {
    mockGetSkillById.mockResolvedValue({
      id: "skill-1",
      name: "custom-skill",
      workspaceId: "ws-test-123",
      source: "CUSTOM",
    });
    mockUpdateSkillRecord.mockResolvedValue({
      id: "skill-1",
      name: "custom-skill",
      source: "CUSTOM",
    });

    const req = new Request("http://localhost/api/skills/skill-1", {
      method: "PUT",
      body: JSON.stringify({ description: "updated" }),
    });
    const res = await PUT(req, createRouteContext("skill-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockUpdateSkillRecord).toHaveBeenCalled();
  });
});

describe("DELETE /api/skills/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("BUILTIN 技能返回 403", async () => {
    mockGetSkillById.mockResolvedValue({
      id: "skill-builtin",
      name: "builtin-skill",
      workspaceId: "ws-test-123",
      source: "BUILTIN",
    });

    const req = new Request("http://localhost/api/skills/skill-builtin", {
      method: "DELETE",
    });
    const res = await DELETE(req, createRouteContext("skill-builtin"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe("内置技能不可删除");
    expect(mockDeleteSkillRecord).not.toHaveBeenCalled();
  });

  it("CUSTOM 技能可正常删除", async () => {
    mockGetSkillById.mockResolvedValue({
      id: "skill-1",
      name: "custom-skill",
      workspaceId: "ws-test-123",
      source: "CUSTOM",
    });
    mockDeleteSkillRecord.mockResolvedValue({ id: "skill-1" });

    const req = new Request("http://localhost/api/skills/skill-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, createRouteContext("skill-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDeleteSkillRecord).toHaveBeenCalled();
  });
});
