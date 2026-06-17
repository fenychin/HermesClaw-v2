import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { TaskEnvelope } from "@hermesclaw/event-contracts"
import { ExecutionEventSchema, type ExecutionEvent } from "@hermesclaw/event-contracts"
import { dispatchTaskEnvelope, subscribeExecutionEvents } from "../execution-bus"
import { prisma } from "@/lib/prisma"

// ---- Mock Auth ----
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve({ user: { id: "test-user", name: "测试用户" } })),
}));

// ---- Mock Audit ----
vi.mock("@/lib/server/audit", () => ({
  writeAuditLog: vi.fn(() => Promise.resolve()),
  actorFromSession: vi.fn(() => Promise.resolve("system")),
}));

// ---- Mock fetch 防止测试中产生跨网物理调用 ----
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("OpenClaw Execution Bus Integration", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ summary: "Test HTTP response summary" })),
    } as any);

    // 确保测试数据库中存在需要的 Workspace 记录，防止外键冲突并允许 L3 等级派发
    await prisma.workspace.upsert({
      where: { id: "ws-bus-test-003" },
      update: { automationLevel: "L3" },
      create: {
        id: "ws-bus-test-003",
        name: "Test Workspace",
        automationLevel: "L3",
      },
    });
  });

  afterAll(async () => {
    // 清理测试插入的 Workspace 数据，保持数据库洁净
    await prisma.workspace.deleteMany({
      where: { id: "ws-bus-test-003" },
    });
  });

  it("正常执行 → 输出 started -> completed -> summary 事件链且全校验合规", async () => {
    const taskId = "t-bus-test-001";
    const envelope: TaskEnvelope = {
      taskId,
      workflowRunId: "run-bus-test-002",
      workspaceId: "ws-bus-test-003",
      industryId: "industry-bus-test-004",
      agentId: "agent-bus-test-005",
      actionType: "http.post",
      input: {
        url: "https://example.com/api/test",
        body: { key: "value" },
      },
      automationLevel: "L3",
      riskLevel: "medium",
      idempotencyKey: "idem-bus-test-006",
      callbackTarget: "test-callback",
      policySnapshotVersion: "1.0.0",
      version: "1.0.0",
    };

    const receivedEvents: ExecutionEvent[] = [];

    // 1. 订阅事件轨迹
    const unsubscribe = subscribeExecutionEvents(taskId, (event) => {
      receivedEvents.push(event);
    });

    // 2. 派发执行任务封包
    await dispatchTaskEnvelope(envelope);

    // 3. 卸载监听
    unsubscribe();

    // 4. 断言事件链
    expect(receivedEvents.length).toBe(3);

    const [startedEvent, completedEvent, summaryEvent] = receivedEvents;

    // 所有发出事件均能通过契约 Schema 校验
    expect(() => ExecutionEventSchema.parse(startedEvent)).not.toThrow();
    expect(() => ExecutionEventSchema.parse(completedEvent)).not.toThrow();
    expect(() => ExecutionEventSchema.parse(summaryEvent)).not.toThrow();

    // 事件一：started
    expect(startedEvent.eventType).toBe("run.started");
    expect(startedEvent.status).toBe("started");

    // 事件二：completed
    expect(completedEvent.eventType).toBe("run.completed");
    expect(completedEvent.status).toBe("completed");
    expect(completedEvent.payload.outcome).toBe("success");
    expect(completedEvent.payload.receiptId).toBeDefined();

    // 事件三：summary 摘要
    expect(summaryEvent.eventType).toBe("run.progress");
    expect(summaryEvent.status).toBe("completed");
    expect(summaryEvent.payload.summary).toBe("Test HTTP response summary");

    // 验证底层 fetch 调用传参
    expect(mockFetch).toHaveBeenCalledWith("https://example.com/api/test", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ key: "value" }),
    }));
  });

  it("执行失败 → 输出 started -> failed 事件链并校验合规", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as any);

    const taskId = "t-bus-test-err";
    const envelope: TaskEnvelope = {
      taskId,
      workflowRunId: "run-bus-test-002",
      workspaceId: "ws-bus-test-003",
      industryId: "industry-bus-test-004",
      agentId: "agent-bus-test-005",
      actionType: "http.post",
      input: {
        url: "https://example.com/api/test",
      },
      automationLevel: "L2",
      riskLevel: "low",
      idempotencyKey: "idem-bus-test-err",
      callbackTarget: "test-callback",
      policySnapshotVersion: "1.0.0",
      version: "1.0.0",
    };

    const receivedEvents: ExecutionEvent[] = [];

    const unsubscribe = subscribeExecutionEvents(taskId, (event) => {
      receivedEvents.push(event);
    });

    await dispatchTaskEnvelope(envelope);
    unsubscribe();

    expect(receivedEvents.length).toBe(2);
    const [startedEvent, failedEvent] = receivedEvents;

    expect(() => ExecutionEventSchema.parse(startedEvent)).not.toThrow();
    expect(() => ExecutionEventSchema.parse(failedEvent)).not.toThrow();

    expect(startedEvent.status).toBe("started");
    expect(failedEvent.eventType).toBe("run.failed");
    expect(failedEvent.status).toBe("failed");
    expect(failedEvent.payload.error).toContain("HTTP_ERR_500");
  });
});
