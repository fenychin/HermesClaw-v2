import { z } from "zod"
import {
  IdSchema,
  PayloadSchema,
  TimestampSchema,
  VersionSchema,
} from "./shared"

/** ActionReceipt 独立契约版本。 */
export const ACTION_RECEIPT_VERSION = "1.0.0"

/** 回执结果（外部动作是否成功）。 */
export const ReceiptOutcomeSchema = z.enum(["success", "failure"])
export type ReceiptOutcome = z.infer<typeof ReceiptOutcomeSchema>

/**
 * LLM 响应载体 —— 收窄 ActionReceipt.response 的类型，
 * 使 skill-executor 等消费方可直接读取 confidence / _meta 而无需 as any。
 *
 * 与 PayloadSchema 兼容：保留 z.record(z.string(), z.unknown()) 的宽容性，
 * 不会因额外字段拒绝旧 payload。
 */
export const LlmResponseSchema = PayloadSchema.and(
  z.object({
    /** LLM 输出置信度（0-1），由执行器校验阈值 */
    confidence: z.number().min(0).max(1).optional(),
    /** 嵌套响应（某些 provider 将置信度包在 result 内） */
    result: z.record(z.string(), z.unknown()).optional(),
    /** 执行追踪元数据（provider / model / duration 等） */
    _meta: z
      .object({
        provider: z.string().optional(),
        model: z.string().optional(),
        skillId: z.string().optional(),
        skillName: z.string().optional(),
        duration: z.string().optional(),
        automationLevel: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
)

export type LlmResponse = z.infer<typeof LlmResponseSchema>

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
