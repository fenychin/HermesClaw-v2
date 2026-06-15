import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  subscribeOpenClawEvents,
  unsubscribeOpenClawEvents,
  emitExecutionEvent,
  emitOpenClawEvent,
  getOpenClawSubscriberCount,
  sendHeartbeat,
} from "../event-emitter"
import type { ExecutionEvent } from "@/contracts/execution-event"
import { EXECUTION_EVENT_VERSION } from "@/contracts/execution-event"

describe("OpenClaw Event Emitter", () => {
  it("should subscribe and unsubscribe subscribers", () => {
    const id = "sub-test-1"
    const controller = {
      enqueue: vi.fn(),
      close: vi.fn(),
      error: vi.fn(),
    } as unknown as ReadableStreamDefaultController<Uint8Array>

    const countBefore = getOpenClawSubscriberCount()
    subscribeOpenClawEvents(id, controller, {})
    expect(getOpenClawSubscriberCount()).toBe(countBefore + 1)

    unsubscribeOpenClawEvents(id)
    expect(getOpenClawSubscriberCount()).toBe(countBefore)
  })

  it("should match filters correctly and enqueue matching events", () => {
    const id1 = "sub-agent-1"
    const controller1 = { enqueue: vi.fn() } as any

    // 订阅 agent-1 的事件
    subscribeOpenClawEvents(id1, controller1, { agentId: "agent-1" })

    const matchedEvent: ExecutionEvent = {
      eventId: "evt-1",
      taskId: "t-1",
      workflowRunId: "run-1",
      runtimeId: "rt-1",
      eventType: "tool.call.started",
      status: "started",
      timestamp: new Date().toISOString(),
      payload: { agentId: "agent-1" },
      version: EXECUTION_EVENT_VERSION,
    }

    const mismatchedEvent: ExecutionEvent = {
      eventId: "evt-2",
      taskId: "t-2",
      workflowRunId: "run-2",
      runtimeId: "rt-1",
      eventType: "tool.call.started",
      status: "started",
      timestamp: new Date().toISOString(),
      payload: { agentId: "agent-2" },
      version: EXECUTION_EVENT_VERSION,
    }

    // 广播匹配事件
    emitExecutionEvent(matchedEvent)
    expect(controller1.enqueue).toHaveBeenCalledTimes(1)

    // 广播不匹配事件
    emitExecutionEvent(mismatchedEvent)
    expect(controller1.enqueue).toHaveBeenCalledTimes(1) // 依然是 1

    unsubscribeOpenClawEvents(id1)
  })

  it("should support compatibility mode (emitOpenClawEvent) and convert raw event to standard contract", () => {
    const id = "sub-compat"
    const controller = { enqueue: vi.fn() } as any
    subscribeOpenClawEvents(id, controller, { agentId: "compat-agent" })

    emitOpenClawEvent("compat-agent", {
      type: "task:started",
      payload: {
        taskId: "t-compat",
        workflowRunId: "run-compat",
        taskName: "测试发信",
      },
    })

    expect(controller.enqueue).toHaveBeenCalledTimes(1)
    const enqueuedData = controller.enqueue.mock.calls[0][0]
    const decodedText = new TextDecoder().decode(enqueuedData)
    expect(decodedText).toContain("data: ")

    const jsonStr = decodedText.replace(/^data:\s*/, "").trim()
    const parsedEvent = JSON.parse(jsonStr)

    expect(parsedEvent.taskId).toBe("t-compat")
    expect(parsedEvent.workflowRunId).toBe("run-compat")
    expect(parsedEvent.eventType).toBe("tool.call.started")
    expect(parsedEvent.status).toBe("started")
    expect(parsedEvent.payload.agentId).toBe("compat-agent")
    expect(parsedEvent.version).toBe(EXECUTION_EVENT_VERSION)

    unsubscribeOpenClawEvents(id)
  })

  it("should send heartbeat frame", () => {
    const id = "sub-heartbeat"
    const controller = { enqueue: vi.fn() } as any
    subscribeOpenClawEvents(id, controller, {})

    sendHeartbeat(id)
    expect(controller.enqueue).toHaveBeenCalledTimes(1)
    const enqueuedData = controller.enqueue.mock.calls[0][0]
    const decodedText = new TextDecoder().decode(enqueuedData)
    expect(decodedText).toContain("heartbeat")

    unsubscribeOpenClawEvents(id)
  })
})
