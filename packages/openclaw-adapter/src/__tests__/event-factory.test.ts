import { describe, it, expect } from "vitest";
import { createExecutionEvent } from "../executor/event-factory";

describe("createExecutionEvent", () => {
  it("构造标准事件结构，timestamp 为 ISO 字符串", () => {
    const event = createExecutionEvent({
      taskId: "t-001",
      workflowRunId: "run-001",
      runtimeId: "workflow-runner",
      eventType: "run.started",
      status: "started",
      payload: { message: "hello" },
    });

    expect(event.eventId).toMatch(/^evt-/);
    expect(event.taskId).toBe("t-001");
    expect(event.workflowRunId).toBe("run-001");
    expect(event.runtimeId).toBe("workflow-runner");
    expect(event.eventType).toBe("run.started");
    expect(event.status).toBe("started");
    expect(event.payload).toEqual({ message: "hello" });
    expect(event.version).toBe("1.0.0");

    // timestamp 应为 ISO 8601 字符串
    expect(typeof event.timestamp).toBe("string");
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
  });

  it("error 字段默认为 undefined 且 payload 不含 error", () => {
    const event = createExecutionEvent({
      taskId: "t-002",
      workflowRunId: "run-002",
      runtimeId: "openclaw-runtime",
      eventType: "run.completed",
      status: "completed",
    });

    expect(event.payload.error).toBeUndefined();
  });

  it("可显式设置 error 字段（写入 payload.error）", () => {
    const event = createExecutionEvent({
      taskId: "t-003",
      workflowRunId: "run-003",
      runtimeId: "openclaw-runtime",
      eventType: "run.failed",
      status: "failed",
      error: "连接超时",
    });

    expect(event.payload.error).toBe("连接超时");
  });

  it("可携带 parentWorkflowRunId", () => {
    const event = createExecutionEvent({
      taskId: "t-004",
      workflowRunId: "run-child",
      parentWorkflowRunId: "run-parent",
      runtimeId: "workflow-runner",
      eventType: "run.started",
      status: "started",
    });

    expect(event.parentWorkflowRunId).toBe("run-parent");
  });

  it("可携带 connectorId / deviceId / receiptHash", () => {
    const event = createExecutionEvent({
      taskId: "t-005",
      workflowRunId: "run-005",
      runtimeId: "connector-host",
      eventType: "tool.call.completed",
      status: "completed",
      connectorId: "email-connector",
      deviceId: "device-01",
      receiptHash: "sha256-abc123",
    });

    expect(event.connectorId).toBe("email-connector");
    expect(event.deviceId).toBe("device-01");
    expect(event.receiptHash).toBe("sha256-abc123");
  });

  it("支持自定义 eventId", () => {
    const event = createExecutionEvent({
      eventId: "my-custom-event-id",
      taskId: "t-006",
      workflowRunId: "run-006",
      runtimeId: "test",
      eventType: "run.progress",
      status: "progress",
    });

    expect(event.eventId).toBe("my-custom-event-id");
  });

  it("payload 默认为空对象（非 null）", () => {
    const event = createExecutionEvent({
      taskId: "t-007",
      workflowRunId: "run-007",
      runtimeId: "test",
      eventType: "run.created",
      status: "started",
    });

    expect(event.payload).toEqual({});
  });
});
