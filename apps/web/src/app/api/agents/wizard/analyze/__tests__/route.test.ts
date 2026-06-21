import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";

// mock auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve({ user: { email: "test-user@hermesclaw.ai" } })),
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
vi.mock("@/lib/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace")>();
  return {
    ...actual,
    buildWorkspaceContext: vi.fn(() =>
      Promise.resolve({
        workspaceId: "ws-wizard-test",
        role: "MEMBER",
        userId: "u-wizard-test",
      })
    ),
  };
});

// mock llm-provider
vi.mock("@/lib/server/llm-provider", () => ({
  resolveLlmProvider: vi.fn(() => ({ provider: "deepseek", model: "deepseek-chat" })),
  callLlmText: vi.fn(() => Promise.resolve("mocked text")),
  callDeepSeekJson: vi.fn(() => Promise.resolve({
    name: "智能FOB核算官",
    role: "精益成本核算专家",
    description: "核算产品FOB成本并提供报价明细。",
    bindSkills: ["ft-cost-accounting"],
    bindConnectors: [],
    questions: [
      {
        id: "q_oem",
        question: "需要定制OEM标识吗？",
        type: "single",
        options: [{ label: "需要", value: "yes", skills: [], connectors: [] }]
      }
    ]
  })),
  callAnthropicStructured: vi.fn(() => Promise.resolve({
    name: "智能FOB核算官",
    role: "精益成本核算专家",
    description: "核算产品FOB成本并提供报价明细。",
    bindSkills: ["ft-cost-accounting"],
    bindConnectors: [],
    questions: [
      {
        id: "q_oem",
        question: "需要定制OEM标识吗？",
        type: "single",
        options: [{ label: "需要", value: "yes", skills: [], connectors: [] }]
      }
    ]
  })),
  isProviderAvailable: vi.fn(() => false) // 默认测试为未配置密钥，直接测试 Mock 兜底数据
}));

describe("POST /api/agents/wizard/analyze API 路由测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("需求描述为空时抛出 400 错误", async () => {
    const req = new Request("http://localhost/api/agents/wizard/analyze", {
      method: "POST",
      body: JSON.stringify({ requirement: "" })
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("需求描述不能为空");
  });

  it("无 API 密钥时正确降级至 Mock 核算数据", async () => {
    const req = new Request("http://localhost/api/agents/wizard/analyze", {
      method: "POST",
      body: JSON.stringify({ requirement: "帮我自动核算FOB成本" })
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("FOB 成本核算专家");
    expect(body.data.bindSkills).toContain("ft-cost-accounting");
    expect(body.data.questions).toHaveLength(2);
  });

  it("无 API 密钥时正确降级至 Mock 开发信数据", async () => {
    const req = new Request("http://localhost/api/agents/wizard/analyze", {
      method: "POST",
      body: JSON.stringify({ requirement: "我想写封开发信" })
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("外贸开发信专家");
    expect(body.data.bindSkills).toContain("ft-outreach-email");
  });
});
