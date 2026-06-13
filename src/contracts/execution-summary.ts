import { z } from "zod"
import {
  IdSchema,
  TimestampSchema,
  VersionSchema,
} from "./shared"

/** 最终任务状态（由 Hermes 汇总裁定，AGENTS §3.2）。 */
export const FinalStatusSchema = z.enum([
  "completed",
  "failed",
  "cancelled",
  "partial",
])
export type FinalStatus = z.infer<typeof FinalStatusSchema>

/**
 * ExecutionSummary —— 执行摘要（一次任务执行的汇总裁定）。
 *
 * 最终任务状态由 Hermes 依据 ExecutionEvent 轨迹与 ActionReceipt 汇总产出（AGENTS §3.2）。
 */
export const ExecutionSummarySchema = z.object({
  /** 摘要唯一 ID。 */
  summaryId: IdSchema,
  /** 关联任务 ID。 */
  taskId: IdSchema,
  /** 关联工作流运行 ID。 */
  workflowRunId: IdSchema,
  /** 最终状态。 */
  finalStatus: FinalStatusSchema,
  /** 任务开始时刻（ISO-8601）。 */
  startedAt: TimestampSchema,
  /** 任务结束时刻（ISO-8601）。 */
  completedAt: TimestampSchema,
  /** 汇总的事件数量。 */
  eventCount: z.number().int().nonnegative(),
  /** 关联回执哈希列表（与 ActionReceipt 对账）。 */
  receiptHashes: z.array(z.string()).default([]),
  /** 失败/部分成功时的错误摘要（可选）。 */
  error: z.string().optional(),
  /** 契约版本。 */
  version: VersionSchema,
})

export type ExecutionSummary = z.infer<typeof ExecutionSummarySchema>
