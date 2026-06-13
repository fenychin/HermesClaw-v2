import { z } from "zod"

/**
 * 契约层公共定义（单源）。
 *
 * 依据 AGENTS.md 第三章「运行时契约」与第五章 §5.2「Level 与 Automation 分离」。
 * 所有契约对象共享的枚举、时间戳与 version 字段统一在此定义，禁止各文件重复造轮子。
 */

/** 当前契约层语义版本。新增/修改契约字段时递增。 */
export const CONTRACT_VERSION = "1.0.0"

/**
 * 契约 version 字段：semver 形如 `1.0.0`。
 * 每个契约对象都必须携带（AGENTS §3.3 / CLAUDE §7.2）。
 */
export const VersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, "version 必须为 semver，如 1.0.0")

/** ISO-8601 时间戳（带时区偏移），用于事件/回执的发生时刻。 */
export const TimestampSchema = z.iso.datetime({ offset: true })

/**
 * 非空标识符（id/key 类字段的统一约束）。
 *
 * .trim().min(1) 确保纯空白字符串被拒绝。
 * 下游如需更严格约束（如 UUID/前缀格式），可在具体 schema 中叠加 .refine()。
 */
export const IdSchema = z.string().trim().min(1, "id 不能为空或纯空白")

/**
 * 自动化授权等级 L1–L4（AGENTS §5.2）。
 * 描述「单个动作的自动化授权等级」，与进化阶段 Level 0–3 严禁混用。
 * - L1 仅建议级；L2 半自动（人工触发）；L3 自动执行低风险、高风险需审批；
 * - L4 全自动（默认禁止，仅可证明安全场景）。
 */
export const AutomationLevelSchema = z.enum(["L1", "L2", "L3", "L4"])
export type AutomationLevel = z.infer<typeof AutomationLevelSchema>

/** 动作风险等级（用于路由审批与高危拦截）。 */
export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"])
export type RiskLevel = z.infer<typeof RiskLevelSchema>

/**
 * 执行事件类型（AGENTS §3.3：必须映射到标准事件族 run.* / session.* / tool.*）。
 * 对齐 OpenClaw 事件族，便于回执与审批闭环。
 */
export const EventTypeSchema = z.enum([
  // run 族：工作流运行生命周期
  "run.created",
  "run.started",
  "run.progress",
  "run.completed",
  "run.failed",
  "run.cancelled",
  // session 族：会话生命周期
  "session.created",
  "session.resumed",
  "session.ended",
  "session.expired",
  // tool 族：工具/连接器调用
  "tool.call.started",
  "tool.call.completed",
  "tool.call.failed",
  // approval 族：审批流程
  "approval.requested",
  "approval.resolved",
  "approval.rejected",
  "approval.expired",
  // artifact 族：产物管理
  "artifact.created",
  "artifact.updated",
  "artifact.deleted",
])
export type EventType = z.infer<typeof EventTypeSchema>

/** 执行事件状态机（与 OpenClaw 事件状态对齐的最小集）。 */
export const ExecutionStatusSchema = z.enum([
  "started",
  "progress",
  "completed",
  "failed",
  "cancelled",
])
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>

/**
 * 任意结构化负载（外部输入/事件 payload），值不约束但键为字符串。
 *
 * P2 待办：按 actionType / eventType 叠加 discriminatedUnion 做二级 content-type 校验，
 * 而非长期保持最大化宽容。消费者侧可对具体字段叠加 .refine() 收窄。
 */
export const PayloadSchema = z.record(z.string(), z.unknown())
export type Payload = z.infer<typeof PayloadSchema>
