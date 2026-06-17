import { z } from "zod"
import {
  AutomationLevelSchema,
  RiskLevelSchema,
} from "./shared"

/** HumanApprovalCheckpoint 独立契约版本。 */
export const HUMAN_APPROVAL_CHECKPOINT_VERSION = "1.0.0"

export const ApprovalDecisionSchema = z.enum(['pending', 'approved', 'rejected', 'expired', 'auto-approved'])
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>

/** 审批检查点状态（保持向后兼容）。 */
export const ApprovalStatusSchema = ApprovalDecisionSchema
export type ApprovalStatus = ApprovalDecision

export const ApprovalTriggerReasonSchema = z.enum([
  'risk.level.high',
  'risk.level.critical',
  'automation.level.l3_l4',
  'irreversible.action',
  'eval.proposal.generated',
  'canary.activation',
  'manual.escalation'
])
export type ApprovalTriggerReason = z.infer<typeof ApprovalTriggerReasonSchema>

/**
 * HumanApprovalCheckpoint —— 人工审批检查点。
 *
 * 高危动作 / 无回执写操作 / L3 高风险 / L4 默认禁止场景必须走审批流（AGENTS §3.4 / §5.2 / §6）。
 * 审批状态由 Hermes 作为 Source of Truth 持有（CLAUDE §4.2）。
 */
export const HumanApprovalCheckpointSchema = z.object({
  /** 检查点唯一 ID。 */
  checkpointId: z.string(),
  /** 关联任务 ID。 */
  taskId: z.string().optional(),
  /** 关联工作流运行 ID。 */
  workflowRunId: z.string().optional(),
  /** 关联提案 ID。 */
  proposalId: z.string().optional(),
  /** 工作区 ID */
  workspaceId: z.string(),
  /** 审批决策 */
  decision: ApprovalDecisionSchema,
  /** 状态（兼容老字段，映射至 decision） */
  status: ApprovalStatusSchema.optional(),
  /** 触发原因 */
  triggerReason: ApprovalTriggerReasonSchema,
  /** 发起请求时刻（ISO-8601）。 */
  requestedAt: z.coerce.date(),
  /** 裁决时刻（ISO-8601，已裁决时提供）。 */
  decidedAt: z.coerce.date().optional(),
  /** 审批人 ID（已裁决时提供）。 */
  decidedBy: z.string().optional(),
  /** 超时过期时刻 */
  expiresAt: z.coerce.date(),
  /** 触发审批的动作风险等级。 */
  riskLevel: RiskLevelSchema,
  /** 触发审批的自动化等级。 */
  automationLevel: AutomationLevelSchema,
  /** 给审批人的人类可读摘要 */
  actionSummary: z.string(),
  /** 审批时的完整输入快照 */
  inputSnapshot: z.record(z.string(), z.unknown()),
  /** 快照版本 */
  policySnapshotVersion: z.string(),
  /** 要求的签字人 */
  requiredSigners: z.array(z.string()).optional(),
  /** 已签字人列表 */
  signedList: z.array(z.string()).optional(),
  /** 契约版本 */
  version: z.string().optional(),
})

export type HumanApprovalCheckpoint = z.infer<
  typeof HumanApprovalCheckpointSchema
>

// 超时判断（expiresAt 已过且仍为 pending 则视为 expired）
export function isCheckpointExpired(checkpoint: HumanApprovalCheckpoint): boolean {
  return checkpoint.decision === 'pending' && new Date() > new Date(checkpoint.expiresAt);
}
