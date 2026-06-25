import { describe, it, expect, vi, beforeEach } from "vitest"
import { TaskEnvelopeSchema } from "@hermesclaw/event-contracts"
import { GuardrailError } from "@/lib/server/exceptions"

// ---- Mock Audit ----
const mockWriteAuditLog = vi.fn();
const mockActorFromSession = vi.fn(() => Promise.resolve("test-user"));
vi.mock("@/lib/server/audit", () => ({
  writeAuditLog: (args: any) => mockWriteAuditLog(args),
  actorFromSession: () => mockActorFromSession(),
}));

// ---- Mock LLM Provider ----
const mockCallAnthropicStructured = vi.fn();
const mockCallDeepSeekJson = vi.fn();
vi.mock("@/lib/server/llm-provider", () => ({
  callAnthropicStructured: (args: any) => mockCallAnthropicStructured(args),
  callDeepSeekJson: (args: any) => mockCallDeepSeekJson(args),
}));

// ---- Mock Model Router ----
const mockSelectModel = vi.fn();
vi.mock("@/lib/server/model-router", () => ({
  selectModel: (args: any) => mockSelectModel(args),
}));

// ---- Import intent service under test ----
import { parseIntentToTaskEnvelope } from "@/lib/server/intent-service"

describe("parseIntentToTaskEnvelope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectModel.mockResolvedValue({
      provider: "deepseek",
      model: "deepseek-chat",
      reason: "Mocked selectModel",
    });
  });

  it("正常意图生成 → 输出合法 TaskEnvelope", async () => {
    const mockOutput = {
      actionType: "email.send",
      input: {
        to: "user@example.com",
        subject: "测试",
        content: "测试内容",
      },
      callbackTarget: "test-callback",
    };

    mockCallDeepSeekJson.mockResolvedValue(mockOutput);

    const context = {
      workspaceId: "ws-test-001",
      agentId: "agent-test-002",
      industryId: "industry-test-003",
      automationLevel: "L3" as const,
      riskLevel: "medium" as const,
    };

    const envelope = await parseIntentToTaskEnvelope("帮我发送邮件给 user@example.com", context);

    // 验证 Zod 校验及字段组装
    expect(envelope.taskId).toBeDefined();
    expect(envelope.workflowRunId).toBeDefined();
    expect(envelope.workspaceId).toBe(context.workspaceId);
    expect(envelope.agentId).toBe(context.agentId);
    expect(envelope.industryId).toBe(context.industryId);
    expect(envelope.actionType).toBe(mockOutput.actionType);
    expect(envelope.input).toEqual(mockOutput.input);
    expect(envelope.automationLevel).toBe(context.automationLevel);
    expect(envelope.riskLevel).toBe(context.riskLevel);
    expect(envelope.callbackTarget).toBe(mockOutput.callbackTarget);
    expect(envelope.idempotencyKey).toBeDefined();
    expect(envelope.version).toBe("1.0.0");

    // 检查是否通过 schema 校验
    expect(() => TaskEnvelopeSchema.parse(envelope)).not.toThrow();

    // 验证大模型和路由调用
    expect(mockSelectModel).toHaveBeenCalledWith({
      taskType: "workflow",
      riskLevel: "medium",
      estimatedTokens: 1000,
      workspaceId: context.workspaceId,
    });
    expect(mockCallDeepSeekJson).toHaveBeenCalledOnce();

    // 验证审计日志被正常记录
    expect(mockWriteAuditLog).toHaveBeenCalledWith({
      actor: "test-user",
      action: "workflow.generate",
      targetType: "task",
      targetId: envelope.taskId,
      detail: `用户意图解析成功: "帮我发送邮件给 user@example.com" -> 动作: "email.send"`,
      riskLevel: "medium",
      workspaceId: context.workspaceId,
      workflowRunId: envelope.workflowRunId,
    });
  });

  it("正常意图生成 (Anthropic) → 输出合法 TaskEnvelope", async () => {
    mockSelectModel.mockResolvedValue({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      reason: "Mocked selectModel for Anthropic",
    });

    const mockOutput = {
      actionType: "inquiry.analyze",
      input: {
        text: "请分析此询盘",
      },
      callbackTarget: "workflow-callback",
    };

    mockCallAnthropicStructured.mockResolvedValue(mockOutput);

    const context = {
      workspaceId: "ws-test-001",
      agentId: "agent-test-002",
      industryId: "industry-test-003",
      automationLevel: "L2" as const,
      riskLevel: "low" as const,
    };

    const envelope = await parseIntentToTaskEnvelope("请分析此询盘", context);

    expect(envelope.actionType).toBe(mockOutput.actionType);
    expect(envelope.input).toEqual(mockOutput.input);
    expect(mockCallAnthropicStructured).toHaveBeenCalledOnce();
  });

  it("测试 automationLevel L4 时抛出 GuardrailError", async () => {
    const context = {
      workspaceId: "ws-test-001",
      agentId: "agent-test-002",
      industryId: "industry-test-003",
      automationLevel: "L4" as const,
      riskLevel: "high" as const,
    };

    await expect(
      parseIntentToTaskEnvelope("高危自动执行意图", context)
    ).rejects.toThrow(GuardrailError);

    // 必须保证第一步拦截，不发生路由和 LLM 调用，也不记录审计日志
    expect(mockSelectModel).not.toHaveBeenCalled();
    expect(mockCallDeepSeekJson).not.toHaveBeenCalled();
    expect(mockCallAnthropicStructured).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });
});
