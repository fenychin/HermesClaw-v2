import { z } from "zod"
import {
  EventTypeSchema,
  ExecutionStatusSchema,
  IdSchema,
  PayloadSchema,
  TimestampSchema,
  VersionSchema,
} from "./shared"

/** ExecutionEvent 独立契约版本，独立于 CONTRACT_VERSION。 */
export const EXECUTION_EVENT_VERSION = "1.0.0"

/**
 * ExecutionEvent —— 执行事件（OpenClaw → Hermes 的执行轨迹）。
 *
 * OpenClaw 是 Execution Truth Source（AGENTS §3.2）；Hermes 不得篡改原始事件轨迹。
 * 字段严格对齐 AGENTS §3.3「所有 ExecutionEvent 至少必须包含」清单。
 */
export const ExecutionEventSchema = z.object({
  /** 事件唯一 ID。 */
  eventId: IdSchema,
  /** 关联任务 ID。 */
  taskId: IdSchema,
  /** 关联工作流运行 ID。 */
  workflowRunId: IdSchema,
  /** 发出事件的运行时 ID。 */
  runtimeId: IdSchema,
  /** 事件类型（映射标准事件族 run.* / session.* / tool.*）。 */
  eventType: EventTypeSchema,
  /** 事件状态。 */
  status: ExecutionStatusSchema,
  /** 事件发生时刻（ISO-8601）。 */
  timestamp: TimestampSchema,
  /** 事件负载。 */
  payload: PayloadSchema,
  /** 关联连接器 ID（可选）。 */
  connectorId: IdSchema.optional(),
  /** 关联设备 ID（可选）。 */
  deviceId: IdSchema.optional(),
  /** 对应回执哈希（可选，用于与 ActionReceipt 对账）。 */
  receiptHash: z.string().optional(),
  /** 父工作流运行 ID（可选，子工作流执行时携带，用于重建完整执行追踪链，AGENTS.md §5.2）。 */
  parentWorkflowRunId: IdSchema.optional(),
  /** 事件版本。 */
  version: VersionSchema,
})

export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>
