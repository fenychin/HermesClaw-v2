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
  callLlmText: vi.fn(() => Promise.resolve("mocked simulated output")),
  isProviderAvailable: vi.fn(() => false) // 默认未配置密钥，直接测试 Mock 兜底数据
}));

describe("POST /api/agents/wizard/preview API 路由测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("需求描述为空时抛出 400 错误", async () => {
    const req = new Request("http://localhost/api/agents/wizard/preview", {
      method: "POST",
      body: JSON.stringify({ requirement: "", name: "新智能体" })
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("需求描述不能为空");
  });

  it("无 API 密钥时正确降级至 Mock 成本核算预览数据", async () => {
    const req = new Request("http://localhost/api/agents/wizard/preview", {
      method: "POST",
      body: JSON.stringify({
        requirement: "我想测算不锈钢保温杯的FOB上海报价",
        name: "成本分析官",
        role: "成本控制专家",
        bindSkills: ["ft-cost-accounting"]
      })
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.previewMarkdown).toContain("FOB 费用明细测算");
    expect(body.data.previewMarkdown).toContain("成本分析官");
  });

  it("无 API 密钥时正确降级至 Mock 开发信预览数据", async () => {
    const req = new Request("http://localhost/api/agents/wizard/preview", {
      method: "POST",
      body: JSON.stringify({
        requirement: "帮我针对David采购总监写封英文开发信",
        name: "开发信专家",
        role: "营销专家",
        bindSkills: ["ft-outreach-email"]
      })
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.previewMarkdown).toContain("收件人画像及背景分析");
    expect(body.data.previewMarkdown).toContain("开发信专家");
  });
});
