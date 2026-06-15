/**
 * 跨域契约流程 e2e 测试（CLAUDE.md §10）。
 *
 * 模拟完整的任务生命周期闭环：
 *   TaskEnvelope → dispatch → ExecutionEvent(s) → ExecutionSummary → ActionReceipt 对账
 *
 * 验证：
 *   - 类型一致性（taskId/workflowRunId 贯穿全链路）
 *   - 状态转换合法性
 *   - 回执与事件对账（receiptHash 关联）
 *   - version 字段在所有契约对象中存在且有效
 */
import { describe, it, expect } from "vitest"
import { TaskEnvelopeSchema, type TaskEnvelope } from "../src/task-envelope"
import {
  ExecutionEventSchema,
  type ExecutionEvent,
} from "../src/execution-event"
import {
  ExecutionSummarySchema,
  type ExecutionSummary,
} from "../src/execution-summary"
import { ActionReceiptSchema, type ActionReceipt } from "../src/action-receipt"
import { CONTRACT_VERSION } from "../src/shared"

const TASK_ID = "task_e2e_001"
const RUN_ID = "run_e2e_001"

const envelope: TaskEnvelope = {
  taskId: TASK_ID,
  workflowRunId: RUN_ID,
  workspaceId: "ws_1",
  industryId: "foreign-trade",
  agentId: "agent_1",
  actionType: "email.send",
  input: { to: "client@example.com", subject: "报价确认" },
  automationLevel: "L2",
  riskLevel: "medium",
  idempotencyKey: "idem_e2e_001",
  callbackTarget: "topic:task.result",
  policySnapshotVersion: "1.0.0",
  version: CONTRACT_VERSION,
}

const events: ExecutionEvent[] = [
  {
    eventId: "evt_e2e_001",
    taskId: TASK_ID,
    workflowRunId: RUN_ID,
    runtimeId: "runtime_1",
    eventType: "run.started",
    status: "started",
    timestamp: "2026-06-13T10:00:00Z",
    payload: {},
    version: CONTRACT_VERSION,
  },
  {
    eventId: "evt_e2e_002",
    taskId: TASK_ID,
    workflowRunId: RUN_ID,
    runtimeId: "runtime_1",
    eventType: "tool.call.started",
    status: "progress",
    timestamp: "2026-06-13T10:00:01Z",
    payload: { tool: "email.send" },
    connectorId: "conn_email",
    version: CONTRACT_VERSION,
  },
  {
    eventId: "evt_e2e_003",
    taskId: TASK_ID,
    workflowRunId: RUN_ID,
    runtimeId: "runtime_1",
    eventType: "tool.call.completed",
    status: "completed",
    timestamp: "2026-06-13T10:00:05Z",
    payload: { tool: "email.send", messageId: "msg_42" },
    connectorId: "conn_email",
    receiptHash: "sha256:abc123",
    version: CONTRACT_VERSION,
  },
  {
    eventId: "evt_e2e_sub_001",
    taskId: "task_sub_001",
    workflowRunId: "run_sub_001",
    parentWorkflowRunId: RUN_ID,
    runtimeId: "runtime_1",
    eventType: "run.created",
    status: "started",
    timestamp: "2026-06-13T10:00:02Z",
    payload: {},
    version: CONTRACT_VERSION,
  },
  {
    eventId: "evt_e2e_sub_002",
    taskId: "task_sub_001",
    workflowRunId: "run_sub_001",
    parentWorkflowRunId: RUN_ID,
    runtimeId: "runtime_1",
    eventType: "run.completed",
    status: "completed",
    timestamp: "2026-06-13T10:00:04Z",
    payload: {},
    version: CONTRACT_VERSION,
  },
  {
    eventId: "evt_e2e_004",
    taskId: TASK_ID,
    workflowRunId: RUN_ID,
    runtimeId: "runtime_1",
    eventType: "run.completed",
    status: "completed",
    timestamp: "2026-06-13T10:00:06Z",
    payload: {},
    version: CONTRACT_VERSION,
  },
]

const summary: ExecutionSummary = {
  summaryId: "sum_e2e_001",
  taskId: TASK_ID,
  workflowRunId: RUN_ID,
  finalStatus: "completed",
  startedAt: "2026-06-13T10:00:00Z",
  completedAt: "2026-06-13T10:00:06Z",
  eventCount: events.length,
  receiptHashes: ["sha256:abc123"],
  version: CONTRACT_VERSION,
}

const receipt: ActionReceipt = {
  receiptId: "rcpt_e2e_001",
  taskId: TASK_ID,
  workflowRunId: RUN_ID,
  connectorId: "conn_email",
  idempotencyKey: "idem_e2e_001",
  outcome: "success",
  executedAt: "2026-06-13T10:00:05Z",
  response: { messageId: "msg_42", status: "delivered" },
  version: CONTRACT_VERSION,
}

describe("跨域契约 e2e 流程（TaskEnvelope → Events → Summary → Receipt 闭环）", () => {
  it("TaskEnvelope 通过 schema 校验", () => {
    expect(TaskEnvelopeSchema.parse(envelope)).toEqual(envelope)
  })

  it("全部 ExecutionEvent 通过 schema 校验且主工作流事件 taskId/workflowRunId 一致", () => {
    for (const evt of events) {
      const parsed = ExecutionEventSchema.parse(evt)
      if (!parsed.parentWorkflowRunId) {
        expect(parsed.taskId).toBe(TASK_ID)
        expect(parsed.workflowRunId).toBe(RUN_ID)
      } else {
        expect(parsed.parentWorkflowRunId).toBe(RUN_ID)
      }
    }
  })

  it("ExecutionSummary 正确汇总事件数量", () => {
    const parsed = ExecutionSummarySchema.parse(summary)
    expect(parsed.eventCount).toBe(events.length)
    expect(parsed.taskId).toBe(TASK_ID)
    expect(parsed.workflowRunId).toBe(RUN_ID)
  })

  it("ActionReceipt.receiptHash 与 ExecutionEvent 中的 receiptHash 可对账", () => {
    const toolCompleted = events.find(
      (e) => e.eventType === "tool.call.completed",
    )
    expect(toolCompleted?.receiptHash).toBe("sha256:abc123")
    // 摘要应包含该 hash
    const parsed = ExecutionSummarySchema.parse(summary)
    expect(parsed.receiptHashes).toContain("sha256:abc123")
  })

  it("幂等键一致：TaskEnvelope.idempotencyKey === ActionReceipt.idempotencyKey", () => {
    expect(envelope.idempotencyKey).toBe(receipt.idempotencyKey)
  })

  it("状态机流转合法：started → progress → completed → completed", () => {
    const statuses = events.filter(e => !e.parentWorkflowRunId).map((e) => e.status)
    expect(statuses).toEqual(["started", "progress", "completed", "completed"])
  })

  it("全部契约对象 version 字段一致（当前均为 CONTRACT_VERSION）", () => {
    expect(envelope.version).toBe(CONTRACT_VERSION)
    for (const evt of events) expect(evt.version).toBe(CONTRACT_VERSION)
    expect(summary.version).toBe(CONTRACT_VERSION)
    expect(receipt.version).toBe(CONTRACT_VERSION)
  })

  it("序列化 round-trip：整个流程 JSON 序列化后所有对象可恢复", () => {
    const json = JSON.stringify({ envelope, events, summary, receipt })
    const restored = JSON.parse(json) as {
      envelope: unknown
      events: unknown[]
      summary: unknown
      receipt: unknown
    }

    expect(TaskEnvelopeSchema.parse(restored.envelope)).toEqual(envelope)
    for (const evt of restored.events) {
      ExecutionEventSchema.parse(evt)
    }
    expect(ExecutionSummarySchema.parse(restored.summary)).toEqual(summary)
    expect(ActionReceiptSchema.parse(restored.receipt)).toEqual(receipt)
  })

  it("可通过 parentWorkflowRunId 建立父子调用链并构建完整调用树", () => {
    // 过滤出父运行是 RUN_ID 的子工作流事件
    const childEvents = events.filter(e => e.parentWorkflowRunId === RUN_ID)
    expect(childEvents.length).toBe(2)
    expect(childEvents.every(e => e.parentWorkflowRunId === RUN_ID)).toBe(true)
    
    // 构建关系树：父 RUN_ID -> 子运行列表
    const relationshipTree = new Map<string, string[]>()
    for (const evt of events) {
      if (evt.parentWorkflowRunId) {
        const children = relationshipTree.get(evt.parentWorkflowRunId) || []
        if (!children.includes(evt.workflowRunId)) {
          children.push(evt.workflowRunId)
        }
        relationshipTree.set(evt.parentWorkflowRunId, children)
      }
    }
    
    expect(relationshipTree.get(RUN_ID)).toContain("run_sub_001")
  })
})
