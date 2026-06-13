import { z } from "zod"
import {
  AutomationLevelSchema,
  IdSchema,
  PayloadSchema,
  RiskLevelSchema,
  VersionSchema,
} from "./shared"

/**
 * TaskEnvelope —— 任务封装（Hermes → OpenClaw 的任务契约）。
 *
 * Hermes 是 Task Truth Source（AGENTS §3.2）。字段严格对齐 AGENTS §3.3「必备字段（最小集）」，
 * 不得自创或漏字段。
 */
export const TaskEnvelopeSchema = z.object({
  /** 任务全局唯一 ID。 */
  taskId: IdSchema,
  /** 所属工作流运行 ID。 */
  workflowRunId: IdSchema,
  /** 租户 / 工作区 ID（RBAC 与租户边界，AGENTS §6.1）。 */
  workspaceId: IdSchema,
  /** 行业包 ID（Industry Pack Layer）。 */
  industryId: IdSchema,
  /** 发起该动作的 Agent ID。 */
  agentId: IdSchema,
  /** 动作类型（与 CapabilityRegistration.actionTypes 对应）。 */
  actionType: IdSchema,
  /** 结构化任务输入。 */
  input: PayloadSchema,
  /** 自动化授权等级 L1–L4。 */
  automationLevel: AutomationLevelSchema,
  /** 动作风险等级。 */
  riskLevel: RiskLevelSchema,
  /** 幂等键（AGENTS §3.4：所有动作必须具备）。 */
  idempotencyKey: IdSchema,
  /** 执行结果回调目标（topic / url / 队列名）。 */
  callbackTarget: IdSchema,
  /** 任务对应的策略快照版本（治理留痕）。 */
  policySnapshotVersion: VersionSchema,
  /** 契约版本。 */
  version: VersionSchema,
})

export type TaskEnvelope = z.infer<typeof TaskEnvelopeSchema>
