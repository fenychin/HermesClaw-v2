import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOpenClawAdapter } from "../executor";
import type { ExecutionAdapter } from "../executor";
import type { TaskEnvelope } from "@hermesclaw/event-contracts";

/** 构造最小合法 TaskEnvelope */
function makeEnvelope(overrides?: Partial<TaskEnvelope>): TaskEnvelope {
  return {
    taskId: `t-${crypto.randomUUID()}`,
    workflowRunId: `run-${crypto.randomUUID()}`,
    workspaceId: "ws-test",
    industryId: "test-industry",
    agentId: "test-agent",
    actionType: "skill.test",
    input: { taskName: "测试任务" },
    automationLevel: "L2",
    riskLevel: "low",
    idempotencyKey: `idem-${crypto.randomUUID()}`,
    callbackTarget: "test-callback",
    policySnapshotVersion: "1.0.0",
    version: "1.0.0",
    ...overrides,
  };
}

describe("ExecutionAdapter.dispatch", () => {
  let adapter: ExecutionAdapter;

  beforeEach(() => {
    adapter = createOpenClawAdapter({
      baseUrl: "http://localhost:8001",
      apiKey: "test-key",
      useMock: true, // 强制 Mock 模式，不发起真实网络请求
    });
  });

  it("dispatch 返回 { eventId }，且 eventId 以 evt- 开头", async () => {
    const envelope = makeEnvelope();
    const result = await adapter.dispatch(envelope);

    expect(result).toBeDefined();
    expect(typeof result.eventId).toBe("string");
    expect(result.eventId).toMatch(/^evt-/);
  });

  it("dispatch 后 getStatus 返回非 null 状态", async () => {
    const envelope = makeEnvelope();
    await adapter.dispatch(envelope);

    const status = await adapter.getStatus(envelope.taskId);
    expect(status).not.toBeNull();
    expect(["started", "progress", "completed", "failed"]).toContain(status);
  });

  it("不同 taskId 的 dispatch 相互隔离", async () => {
    const envA = makeEnvelope({ taskId: "task-a" });
    const envB = makeEnvelope({ taskId: "task-b" });

    await adapter.dispatch(envA);
    await adapter.dispatch(envB);

    const statusA = await adapter.getStatus("task-a");
    const statusB = await adapter.getStatus("task-b");

    expect(statusA).not.toBeNull();
    expect(statusB).not.toBeNull();
  });

  it("subscribe 能收到 dispatch 发出的事件", async () => {
    const envelope = makeEnvelope();
    const received: string[] = [];

    const unsubscribe = adapter.subscribe(envelope.taskId, (event) => {
      received.push(event.eventType);
    });

    await adapter.dispatch(envelope);

    // 至少应收到 started 事件
    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received).toContain("run.started");

    unsubscribe();
  });

  it("unsubscribe 后不再收到事件", async () => {
    const envelope1 = makeEnvelope();
    const envelope2 = makeEnvelope();
    const received: string[] = [];

    const unsubscribe = adapter.subscribe(envelope1.taskId, (event) => {
      received.push(event.taskId);
    });

    await adapter.dispatch(envelope1);
    unsubscribe();

    // 第二个 dispatch 不应触发回调
    await adapter.dispatch(envelope2);
    expect(received.every((id) => id === envelope1.taskId)).toBe(true);
  });

  it("localExecutor 回调被调用", async () => {
    const localExecutor = vi.fn().mockResolvedValue({
      taskId: "t-001",
      status: "succeeded",
      outputs: { summary: "本地执行成功" },
      durationMs: 50,
      completedAt: new Date().toISOString(),
    });

    const localAdapter = createOpenClawAdapter(
      { baseUrl: "http://localhost:8001", apiKey: "test-key", useMock: true },
      localExecutor,
    );

    const envelope = makeEnvelope();
    await localAdapter.dispatch(envelope);

    expect(localExecutor).toHaveBeenCalledTimes(1);
    const calledEnvelope = localExecutor.mock.calls[0][0] as TaskEnvelope;
    expect(calledEnvelope.taskId).toBe(envelope.taskId);
  });

  it("本地执行失败时返回 outcome=failure 而非 reject", async () => {
    const localExecutor = vi.fn().mockRejectedValue(new Error("模拟执行异常"));

    const localAdapter = createOpenClawAdapter(
      { baseUrl: "http://localhost:8001", apiKey: "test-key", useMock: true },
      localExecutor,
    );

    const envelope = makeEnvelope();
    // mock executor 会 catch 异常并返回 { outcome: 'failure' }，不会抛到 dispatch 层
    const result = await localAdapter.dispatch(envelope);
    expect(result.eventId).toMatch(/^evt-/);

    // 执行状态应为 failed
    const status = await localAdapter.getStatus(envelope.taskId);
    expect(status).toBe("failed");
  });
});
