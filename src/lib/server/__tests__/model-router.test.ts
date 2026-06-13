/**
 * 策略路由单元测试（selectModel）
 *
 * 覆盖要点：
 *   - 高风险 → Anthropic 高能力模型
 *   - 工作流 → DeepSeek 成本优化模型
 *   - 默认路由 → 工作空间配置
 *   - Provider 不可用降级
 *   - 审计日志写入
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock auth (next-auth 依赖链入口) ----
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve({ user: { id: "test-user", name: "测试用户" } })),
}));

// ---- Mock Prisma ----
const mockAuditCreate = vi.fn();
const mockFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) },
    workspaceSettings: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
  },
}));

// ---- Mock logger ----
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---- Mock isProviderAvailable ----
const mockIsAvailable = vi.fn<(provider: string) => boolean>(() => true);

vi.mock("@/lib/server/llm-provider", () => ({
  isProviderAvailable: (provider: string) => mockIsAvailable(provider),
  DEFAULT_ANTHROPIC_MODEL: "claude-sonnet-4-6",
  DEFAULT_DEEPSEEK_MODEL: "deepseek-chat",
}));

import { selectModel } from "@/lib/server/model-router";
import type { ModelRouteContext } from "@/lib/server/model-router";

// ---- 测试辅助 ----

function ctx(overrides?: Partial<ModelRouteContext>): ModelRouteContext {
  return {
    taskType: "chat",
    riskLevel: "low",
    estimatedTokens: 500,
    workspaceId: "ws-test-001",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAvailable.mockReturnValue(true);
  mockAuditCreate.mockResolvedValue({});
  mockFindUnique.mockResolvedValue(null); // 无工作空间配置 → 缺省值
});

// ==========================================
// 基本路由决策
// ==========================================

describe("selectModel — 基本路由决策", () => {
  it("高风险任务路由至 Anthropic 高能力模型", async () => {
    const decision = await selectModel(ctx({ riskLevel: "high" }));
    expect(decision.provider).toBe("anthropic");
    expect(decision.model).toBe("claude-sonnet-4-6");
    expect(decision.reason).toContain("高风险");
  });

  it("工作流任务路由至 DeepSeek 成本优化模型", async () => {
    const decision = await selectModel(ctx({ taskType: "workflow", riskLevel: "low" }));
    expect(decision.provider).toBe("deepseek");
    expect(decision.model).toBe("deepseek-chat");
    expect(decision.reason).toContain("工作流");
  });

  it("工作流 + 高风险 → 高风险优先", async () => {
    const decision = await selectModel(ctx({ taskType: "workflow", riskLevel: "high" }));
    // 高风险优先级高于工作流
    expect(decision.provider).toBe("anthropic");
    expect(decision.model).toBe("claude-sonnet-4-6");
  });

  it("默认路由使用缺省工作空间配置", async () => {
    const decision = await selectModel(ctx());
    // 无工作空间配置 → 默认 deepseek-chat
    expect(decision.provider).toBe("deepseek");
    expect(decision.model).toBe("deepseek-chat");
    expect(decision.reason).toContain("默认策略路由");
  });

  it("工作空间配置了自定义默认模型", async () => {
    mockFindUnique.mockResolvedValue({
      workspaceId: "ws-test-001",
      defaultModel: "claude-haiku-4-5",
      taskProviderMap: "{}",
    });
    const decision = await selectModel(ctx());
    expect(decision.model).toBe("claude-haiku-4-5");
    expect(decision.provider).toBe("anthropic");
  });

  it("工作空间配置了 taskType Provider 偏好", async () => {
    mockFindUnique.mockResolvedValue({
      workspaceId: "ws-test-001",
      defaultModel: "deepseek-chat",
      taskProviderMap: JSON.stringify({ chat: "anthropic" }),
    });
    const decision = await selectModel(ctx());
    // chat taskType 偏好 anthropic，模型也切换为 anthropic 默认
    expect(decision.provider).toBe("anthropic");
    expect(decision.model).toBe("claude-sonnet-4-6");
  });
});

// ==========================================
// Provider 可用性降级
// ==========================================

describe("selectModel — Provider 可用性降级", () => {
  it("Anthropic 不可用时高风险任务降级至 DeepSeek", async () => {
    mockIsAvailable.mockImplementation((p: string) => p !== "anthropic");
    const decision = await selectModel(ctx({ riskLevel: "high" }));
    expect(decision.provider).toBe("deepseek");
    expect(decision.model).toBe("deepseek-chat");
    expect(decision.reason).toContain("降级");
  });

  it("DeepSeek 不可用时工作流降级至 Anthropic", async () => {
    mockIsAvailable.mockImplementation((p: string) => p !== "deepseek");
    const decision = await selectModel(ctx({ taskType: "workflow", riskLevel: "low" }));
    expect(decision.provider).toBe("anthropic");
    expect(decision.model).toBe("claude-sonnet-4-6");
    expect(decision.reason).toContain("降级");
  });

  it("两者均不可用时保持原决策", async () => {
    mockIsAvailable.mockReturnValue(false);
    const decision = await selectModel(ctx({ riskLevel: "high" }));
    // 保持原决策：anthropic + claude-sonnet-4-6
    expect(decision.provider).toBe("anthropic");
    expect(decision.model).toBe("claude-sonnet-4-6");
    expect(decision.reason).not.toContain("降级");
  });
});

// ==========================================
// 审计日志
// ==========================================

describe("selectModel — 审计日志", () => {
  it("每次路由决策写入审计日志", async () => {
    await selectModel(ctx({ riskLevel: "medium" }));
    expect(mockAuditCreate).toHaveBeenCalledOnce();
    const auditData = mockAuditCreate.mock.calls[0][0].data;
    expect(auditData.action).toBe("model.route");
    expect(auditData.targetType).toBe("model");
    expect(auditData.riskLevel).toBe("medium");
  });

  it("审计日志附带 contextSnapshot", async () => {
    await selectModel(ctx({ estimatedTokens: 2000 }));
    expect(mockAuditCreate).toHaveBeenCalledOnce();
    const auditData = mockAuditCreate.mock.calls[0][0].data;
    expect(auditData.contextSnapshot.taskType).toBe("chat");
    expect(auditData.contextSnapshot.estimatedTokens).toBe(2000);
    expect(auditData.contextSnapshot.selectedProvider).toBeDefined();
  });

  it("审计日志写入失败不阻断路由", async () => {
    mockAuditCreate.mockRejectedValue(new Error("DB down"));
    const decision = await selectModel(ctx());
    expect(decision.provider).toBeDefined();
    expect(decision.model).toBeDefined();
  });

  it("高风险 → automationLevel L3", async () => {
    await selectModel(ctx({ riskLevel: "high" }));
    expect(mockAuditCreate.mock.calls[0][0].data.automationLevel).toBe("L3");
  });

  it("工作流 → triggeredBy system", async () => {
    await selectModel(ctx({ taskType: "workflow" }));
    expect(mockAuditCreate.mock.calls[0][0].data.triggeredBy).toBe("system");
  });

  it("chat → triggeredBy user", async () => {
    await selectModel(ctx({ taskType: "chat" }));
    expect(mockAuditCreate.mock.calls[0][0].data.triggeredBy).toBe("user");
  });
});
