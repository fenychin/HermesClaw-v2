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

/**
 * API 兼容性范围（替代单点 version，用于 CapabilityRegistration/IndustryManifest
 * 声明兼容的 Hermes API 版本区间，AGENTS §6.3）。
 *
 * min ≤ version ≤ max；min 与 max 各自为 semver。
 * CapabilityRegistration.compatibleHermesApi 使用此 schema，
 * 避免每次 Hermes 小版本升级都需所有 Runtime 重新注册。
 */
export const VersionRangeSchema = z.object({
  min: VersionSchema,
  max: VersionSchema,
})
export type VersionRange = z.infer<typeof VersionRangeSchema>

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
 * 使用 `typedPayload({...})` 构造已知形状的窄 payload。
 */
export const PayloadSchema = z.record(z.string(), z.unknown())
export type Payload = z.infer<typeof PayloadSchema>

/**
 * 类型化 Payload 构造器 —— P2 discriminatedUnion 的预备构件。
 *
 * 产出 schema：必须包含 shape 中声明的字段（类型安全），同时允许额外任意键
 * （保持 PayloadSchema 的宽容性，不因新增字段拒绝旧 payload）。
 *
 * P2 计划用法：
 *   const ActionPayload = z.discriminatedUnion("actionType", [
 *     z.object({ actionType: z.literal("email.send") }).and(typedPayload({ to: z.string().email(), subject: z.string() })),
 *     z.object({ actionType: z.literal("wechat.send") }).and(typedPayload({ openId: z.string(), content: z.string() })),
 *   ])
 */
export function typedPayload<Shape extends z.ZodRawShape>(
  shape: Shape,
): z.ZodIntersection<z.ZodObject<Shape>, typeof PayloadSchema> {
  return z.object(shape).and(PayloadSchema)
}

// ─── P2 类型化 Payload（按 eventType 收窄） ─────────────────────────────

/**
 * Run 族事件 Payload。
 *
 * 覆盖 eventType：run.created / run.started / run.progress /
 * run.completed / run.failed / run.cancelled
 */
export const RunPayloadSchema = typedPayload({
  /** 工作流运行 ID。 */
  runId: IdSchema,
  /** 工作流名称。 */
  workflowName: z.string().optional(),
  /** 运行状态。 */
  status: ExecutionStatusSchema.optional(),
  /** 运行输出（completed 时）。 */
  output: z.unknown().optional(),
  /** 错误信息（failed 时）。 */
  error: z.string().optional(),
  /** 执行耗时（毫秒）。 */
  durationMs: z.number().nonnegative().optional(),
})
export type RunPayload = z.infer<typeof RunPayloadSchema>

/**
 * Session 族事件 Payload。
 *
 * 覆盖 eventType：session.created / session.resumed /
 * session.ended / session.expired
 */
export const SessionPayloadSchema = typedPayload({
  /** 会话 ID。 */
  sessionId: IdSchema,
  /** 用户 ID。 */
  userId: IdSchema.optional(),
  /** 会话来源。 */
  source: z.enum(["web", "mobile", "api", "cron"]).optional(),
  /** 会话过期时间（ISO-8601）。 */
  expiresAt: z.string().optional(),
})
export type SessionPayload = z.infer<typeof SessionPayloadSchema>

/**
 * Tool Call 族事件 Payload。
 *
 * 覆盖 eventType：tool.call.started / tool.call.completed / tool.call.failed
 */
export const ToolCallPayloadSchema = typedPayload({
  /** 工具调用 ID。 */
  callId: IdSchema,
  /** 工具名称。 */
  toolName: z.string().min(1),
  /** 工具调用参数。 */
  parameters: z.record(z.string(), z.unknown()).optional(),
  /** 工具调用结果（completed 时）。 */
  result: z.unknown().optional(),
  /** 错误信息（failed 时）。 */
  error: z.string().optional(),
  /** 工具调用耗时（毫秒）。 */
  durationMs: z.number().nonnegative().optional(),
})
export type ToolCallPayload = z.infer<typeof ToolCallPayloadSchema>

/**
 * Approval 族事件 Payload。
 *
 * 覆盖 eventType：approval.requested / approval.resolved /
 * approval.rejected / approval.expired
 */
export const ApprovalPayloadSchema = typedPayload({
  /** 审批 ID。 */
  approvalId: IdSchema,
  /** 审批动作类型。 */
  action: z.string().min(1),
  /** 审批目标类型。 */
  targetType: z.string().min(1).optional(),
  /** 审批目标 ID。 */
  targetId: IdSchema.optional(),
  /** 审批请求原因。 */
  reason: z.string().optional(),
  /** 审批人。 */
  reviewer: z.string().optional(),
  /** 审批决议（resolved/rejected 时）。 */
  decision: z.enum(["approved", "rejected"]).optional(),
  /** 审批备注。 */
  comment: z.string().optional(),
})
export type ApprovalPayload = z.infer<typeof ApprovalPayloadSchema>

/**
 * Artifact 族事件 Payload。
 *
 * 覆盖 eventType：artifact.created / artifact.updated / artifact.deleted
 */
export const ArtifactPayloadSchema = typedPayload({
  /** 产物 ID。 */
  artifactId: IdSchema,
  /** 产物类型。 */
  artifactType: z.string().min(1),
  /** 产物名称。 */
  name: z.string().optional(),
  /** 产物内容引用（URL / 路径）。 */
  contentRef: z.string().optional(),
  /** 产物大小（字节）。 */
  sizeBytes: z.number().nonnegative().optional(),
  /** 产物 MIME 类型。 */
  mimeType: z.string().optional(),
})
export type ArtifactPayload = z.infer<typeof ArtifactPayloadSchema>

/**
 * 按 eventType 的 discriminatedUnion —— ExecutionEvent 的类型安全变体。
 *
 * 用法：
 *   const event = TypedExecutionEventSchema.parse(raw)
 *   // event 被收窄为对应的 payload 类型
 *   if (event.eventType === 'tool.call.completed') {
 *     event.payload.result // ← 类型安全
 *   }
 *
 * 注意：此 schema 是 ExecutionEventSchema 的严格超集（拒绝非法 payload），
 * 适用于需要类型安全 payload 的新代码；向后兼容的场景应继续使用 ExecutionEventSchema。
 */
export const TypedExecutionEventSchema = z.discriminatedUnion("eventType", [
  // run 族
  z.object({
    eventType: z.literal("run.created"),
    payload: RunPayloadSchema,
  }),
  z.object({
    eventType: z.literal("run.started"),
    payload: RunPayloadSchema,
  }),
  z.object({
    eventType: z.literal("run.progress"),
    payload: RunPayloadSchema,
  }),
  z.object({
    eventType: z.literal("run.completed"),
    payload: RunPayloadSchema,
  }),
  z.object({
    eventType: z.literal("run.failed"),
    payload: RunPayloadSchema,
  }),
  z.object({
    eventType: z.literal("run.cancelled"),
    payload: RunPayloadSchema,
  }),
  // session 族
  z.object({
    eventType: z.literal("session.created"),
    payload: SessionPayloadSchema,
  }),
  z.object({
    eventType: z.literal("session.resumed"),
    payload: SessionPayloadSchema,
  }),
  z.object({
    eventType: z.literal("session.ended"),
    payload: SessionPayloadSchema,
  }),
  z.object({
    eventType: z.literal("session.expired"),
    payload: SessionPayloadSchema,
  }),
  // tool 族
  z.object({
    eventType: z.literal("tool.call.started"),
    payload: ToolCallPayloadSchema,
  }),
  z.object({
    eventType: z.literal("tool.call.completed"),
    payload: ToolCallPayloadSchema,
  }),
  z.object({
    eventType: z.literal("tool.call.failed"),
    payload: ToolCallPayloadSchema,
  }),
  // approval 族
  z.object({
    eventType: z.literal("approval.requested"),
    payload: ApprovalPayloadSchema,
  }),
  z.object({
    eventType: z.literal("approval.resolved"),
    payload: ApprovalPayloadSchema,
  }),
  z.object({
    eventType: z.literal("approval.rejected"),
    payload: ApprovalPayloadSchema,
  }),
  z.object({
    eventType: z.literal("approval.expired"),
    payload: ApprovalPayloadSchema,
  }),
  // artifact 族
  z.object({
    eventType: z.literal("artifact.created"),
    payload: ArtifactPayloadSchema,
  }),
  z.object({
    eventType: z.literal("artifact.updated"),
    payload: ArtifactPayloadSchema,
  }),
  z.object({
    eventType: z.literal("artifact.deleted"),
    payload: ArtifactPayloadSchema,
  }),
])
export type TypedExecutionEvent = z.infer<typeof TypedExecutionEventSchema>

// ─── 测试工具（不参与生产导出） ───────────────────────────────────────

/**
 * 契约的 JSON round-trip 测试工具：序列化 → 反序列化 → schema 校验。
 *
 * 由于 JSON.stringify 会丢弃 undefined 值，此函数仅对比有效字段而非全等。
 * 使用方式：在测试中 `const restored = roundTrip(schema, valid)`。
 *
 * 非测试代码不应导入此函数。
 */
export function roundTrip<T>(schema: z.ZodType<T>, value: T): T {
  return schema.parse(JSON.parse(JSON.stringify(value)))
}
