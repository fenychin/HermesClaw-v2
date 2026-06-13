import { z } from "zod"
import {
  AutomationLevelSchema,
  IdSchema,
  RiskLevelSchema,
  TimestampSchema,
  VersionSchema,
} from "./shared"

/** 审批检查点状态。 */
export const ApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
])
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>

/**
 * HumanApprovalCheckpoint —— 人工审批检查点。
 *
 * 高危动作 / 无回执写操作 / L3 高风险 / L4 默认禁止场景必须走审批流（AGENTS §3.4 / §5.2 / §6）。
 * 审批状态由 Hermes 作为 Source of Truth 持有（CLAUDE §4.2）。
 */
export const HumanApprovalCheckpointSchema = z.object({
  /** 检查点唯一 ID。 */
  checkpointId: IdSchema,
  /** 关联任务 ID。 */
  taskId: IdSchema,
  /** 关联工作流运行 ID。 */
  workflowRunId: IdSchema,
  /** 触发审批的自动化等级。 */
  automationLevel: AutomationLevelSchema,
  /** 触发审批的动作风险等级。 */
  riskLevel: RiskLevelSchema,
  /** 触发审批的原因说明。 */
  reason: z.string().min(1),
  /** 发起请求时刻（ISO-8601）。 */
  requestedAt: TimestampSchema,
  /** 审批状态。 */
  status: ApprovalStatusSchema,
  /** 审批人 ID（已裁决时提供）。 */
  decidedBy: IdSchema.optional(),
  /** 裁决时刻（ISO-8601，已裁决时提供）。 */
  decidedAt: TimestampSchema.optional(),
  /** 契约版本。 */
  version: VersionSchema,
})

export type HumanApprovalCheckpoint = z.infer<
  typeof HumanApprovalCheckpointSchema
>
