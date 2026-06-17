/**
 * ExecutionEvent 构造工厂 —— 唯一的事件构造点
 *
 * 三域原则第二域：所有 ExecutionEvent 对象必须通过此工厂创建，
 * 禁止在业务代码中直接构造 ExecutionEvent 字面量。
 *
 * 统一构造确保：
 * - timestamp 自动填充为 ISO 8601 格式
 * - version 从 @hermesclaw/event-contracts 统一注入
 * - error / payload 等可选字段有明确默认值
 * - 未来格式变更只需改此一处
 */
import type { ExecutionEvent } from "@hermesclaw/event-contracts";
import { EXECUTION_EVENT_VERSION } from "@hermesclaw/event-contracts";

export interface CreateExecutionEventParams {
  /** 事件唯一 ID（若省略则自动生成 evt-{uuid}） */
  eventId?: string;
  /** 关联任务 ID */
  taskId: string;
  /** 关联工作流运行 ID */
  workflowRunId: string;
  /** 父工作流运行 ID（子工作流场景） */
  parentWorkflowRunId?: string;
  /** 发出事件的运行时 ID */
  runtimeId: string;
  /** 事件类型（run.* / tool.* / session.*） */
  eventType: ExecutionEvent["eventType"];
  /** 事件状态 */
  status: ExecutionEvent["status"];
  /** 事件负载 */
  payload?: unknown;
  /** 错误信息 */
  error?: string | null;
  /** 关联连接器 ID */
  connectorId?: string;
  /** 关联设备 ID */
  deviceId?: string;
  /** 对应回执哈希 */
  receiptHash?: string;
}

/**
 * 创建标准 ExecutionEvent 对象。
 *
 * 使用方式：
 * ```ts
 * import { createExecutionEvent } from "@hermesclaw/openclaw-adapter";
 *
 * const event = createExecutionEvent({
 *   taskId: "t-123",
 *   workflowRunId: "run-456",
 *   runtimeId: "workflow-runner",
 *   eventType: "run.started",
 *   status: "started",
 *   payload: { message: "开始执行" },
 * });
 * ```
 */
export function createExecutionEvent(
  params: CreateExecutionEventParams,
): ExecutionEvent {
  const payload: Record<string, unknown> = (
    params.payload != null
      ? (params.payload as Record<string, unknown>)
      : {}
  );

  const event: ExecutionEvent = {
    eventId: params.eventId ?? `evt-${crypto.randomUUID()}`,
    taskId: params.taskId,
    workflowRunId: params.workflowRunId,
    parentWorkflowRunId: params.parentWorkflowRunId,
    runtimeId: params.runtimeId,
    eventType: params.eventType,
    status: params.status,
    timestamp: new Date().toISOString(),
    payload,
    connectorId: params.connectorId,
    deviceId: params.deviceId,
    receiptHash: params.receiptHash,
    version: EXECUTION_EVENT_VERSION,
  };

  // error 信息放入 payload（ExecutionEvent 契约无顶层 error 字段）
  if (params.error != null) {
    event.payload.error = params.error;
  }

  return event;
}
