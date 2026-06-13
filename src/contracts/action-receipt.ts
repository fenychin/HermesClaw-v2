import { z } from "zod"
import {
  IdSchema,
  PayloadSchema,
  TimestampSchema,
  VersionSchema,
} from "./shared"

/** 回执结果（外部动作是否成功）。 */
export const ReceiptOutcomeSchema = z.enum(["success", "failure"])
export type ReceiptOutcome = z.infer<typeof ReceiptOutcomeSchema>

/**
 * ActionReceipt —— 动作回执（连接器对外写操作的执行回执）。
 *
 * 依据 AGENTS §3.4：所有对外写操作的连接器必须返回清晰的 receipt 或错误码；
 * 不可逆写操作必须声明 compensationStrategy；无回执的写操作默认视为高风险。
 */
export const ActionReceiptSchema = z.object({
  /** 回执唯一 ID。 */
  receiptId: IdSchema,
  /** 关联任务 ID。 */
  taskId: IdSchema,
  /** 关联工作流运行 ID。 */
  workflowRunId: IdSchema,
  /** 执行该动作的连接器 ID。 */
  connectorId: IdSchema,
  /** 幂等键（与 TaskEnvelope.idempotencyKey 对应，用于去重/重放保护）。 */
  idempotencyKey: IdSchema,
  /** 回执结果。 */
  outcome: ReceiptOutcomeSchema,
  /** 动作执行时刻（ISO-8601）。 */
  executedAt: TimestampSchema,
  /** 外部系统返回的结构化数据。 */
  response: PayloadSchema,
  /** 错误码（outcome=failure 时应提供）。 */
  errorCode: z.string().optional(),
  /** 补偿策略（不可逆写操作必须声明，AGENTS §3.4）。 */
  compensationStrategy: z.string().optional(),
  /** 契约版本。 */
  version: VersionSchema,
})

export type ActionReceipt = z.infer<typeof ActionReceiptSchema>
