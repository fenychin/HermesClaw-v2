import { z } from "zod"
import {
  AutomationLevelSchema,
  IdSchema,
  RiskLevelSchema,
  VersionSchema,
} from "@hermesclaw/event-contracts"

/** HarnessBundle 独立契约版本。 */
export const HARNESS_BUNDLE_VERSION = "1.0.0"

/**
 * WorkflowTemplate —— 工作流模板（HarnessBundle 子对象）。
 *
 * 描述可复用的工作流结构，由 Hermes 生成并写入 Bundle。
 * 依据 CLAUDE.md §2.3：自进化优先修改 WorkflowTemplate。
 */
export const WorkflowTemplateSchema = z.object({
  /** 模板唯一 ID。 */
  templateId: IdSchema,
  /** 模板名称。 */
  name: z.string().min(1),
  /** 适用场景描述。 */
  description: z.string().default(""),
  /** 节点定义（JSON 序列化的 WorkflowNode[]）。 */
  nodes: z.unknown().default([]),
  /** 边定义（JSON 序列化的 WorkflowEdge[]）。 */
  edges: z.unknown().default([]),
  /** 模板版本。 */
  version: VersionSchema,
})
export type WorkflowTemplate = z.infer<typeof WorkflowTemplateSchema>

/**
 * AgentPolicy —— 智能体策略（HarnessBundle 子对象）。
 *
 * 定义单个 Agent 的边界、能力与约束。
 * 依据 CLAUDE.md §2.3：自进化优先修改 AgentPolicy。
 */
export const AgentPolicySchema = z.object({
  /** 策略唯一 ID。 */
  policyId: IdSchema,
  /** 绑定的 Agent ID。 */
  agentId: IdSchema,
  /** 能力清单（can_do）。 */
  canDo: z.array(z.string()).default([]),
  /** 约束清单（cannot_do）。 */
  cannotDo: z.array(z.string()).default([]),
  /** 自动化授权等级。 */
  automationLevel: AutomationLevelSchema,
  /** 绑定的 Skill ID 列表。 */
  bindSkills: z.array(z.string()).default([]),
  /** 绑定的 Connector ID 列表。 */
  bindConnectors: z.array(z.string()).default([]),
  /** 记忆权限。 */
  memoryPermission: z.enum(["read", "read-write", "none"]).default("read"),
  /** 策略版本。 */
  version: VersionSchema,
})
export type AgentPolicy = z.infer<typeof AgentPolicySchema>

/**
 * SkillBinding —— 技能绑定（HarnessBundle 子对象）。
 *
 * 描述 Skill 与 Agent/Workflow 的绑定关系。
 * 依据 CLAUDE.md §2.3：自进化优先修改 SkillBinding。
 */
export const SkillBindingSchema = z.object({
  /** 绑定唯一 ID。 */
  bindingId: IdSchema,
  /** 绑定的 Skill ID。 */
  skillId: IdSchema,
  /** 绑定的目标类型。 */
  targetType: z.enum(["agent", "workflow", "connector"]),
  /** 绑定的目标 ID。 */
  targetId: IdSchema,
  /** 绑定参数覆写（可选）。 */
  overrides: z.record(z.string(), z.unknown()).optional(),
  /** 绑定版本。 */
  version: VersionSchema,
})
export type SkillBinding = z.infer<typeof SkillBindingSchema>

/**
 * ContextPolicy —— 上下文策略（HarnessBundle 子对象）。
 *
 * 定义 Agent 上下文窗口管理规则。
 * 依据 CLAUDE.md §2.3：自进化优先修改 ContextPolicy。
 */
export const ContextPolicySchema = z.object({
  /** 策略唯一 ID。 */
  policyId: IdSchema,
  /** 最大上下文窗口（token 数）。 */
  maxTokens: z.number().int().positive().default(200000),
  /** 压缩触发阈值（token 数）。 */
  compressionThreshold: z.number().int().positive().default(150000),
  /** 压缩策略类型。 */
  compressionStrategy: z.enum(["summarize", "truncate", "hybrid"]).default("hybrid"),
  /** 保留的最近消息数。 */
  recentMessageCount: z.number().int().nonnegative().default(20),
  /** 策略版本。 */
  version: VersionSchema,
})
export type ContextPolicy = z.infer<typeof ContextPolicySchema>

/**
 * MemoryPolicy —— 记忆策略（HarnessBundle 子对象）。
 *
 * 定义多层记忆协同规则。
 * 依据 CLAUDE.md §2.3：自进化优先修改 MemoryPolicy。
 */
export const MemoryPolicySchema = z.object({
  /** 策略唯一 ID。 */
  policyId: IdSchema,
  /** 短期记忆 TTL（秒）。 */
  shortTermTtl: z.number().int().positive().default(3600),
  /** 中期记忆 TTL（秒）。 */
  midTermTtl: z.number().int().positive().default(86400),
  /** 长期记忆保留策略。 */
  longTermRetention: z.enum(["forever", "prune", "archive"]).default("forever"),
  /** 记忆检索策略。 */
  retrievalStrategy: z.enum(["recency", "relevance", "hybrid"]).default("hybrid"),
  /** 策略版本。 */
  version: VersionSchema,
})
export type MemoryPolicy = z.infer<typeof MemoryPolicySchema>

/**
 * ConnectorPolicy —— 连接器策略（HarnessBundle 子对象）。
 *
 * 定义连接器的安全边界与自动化授权。
 * 依据 CLAUDE.md §2.3：自进化优先修改 ConnectorPolicy（非高危部分）。
 */
export const ConnectorPolicySchema = z.object({
  /** 策略唯一 ID。 */
  policyId: IdSchema,
  /** 绑定的 Connector ID。 */
  connectorId: IdSchema,
  /** 允许的操作范围。 */
  allowedScopes: z.array(z.string()).default([]),
  /** 最大调用频率（次/小时）。 */
  maxCallsPerHour: z.number().int().positive().optional(),
  /** 连接器风险等级。 */
  riskLevel: RiskLevelSchema,
  /** 是否需要人工审批（高危操作）。 */
  requiresApproval: z.boolean().default(false),
  /** 策略版本。 */
  version: VersionSchema,
})
export type ConnectorPolicy = z.infer<typeof ConnectorPolicySchema>

/**
 * EvalRuleSet —— 评估规则集（HarnessBundle 子对象）。
 *
 * 定义 Harness 自评估的触发条件与评分规则。
 * 依据 CLAUDE.md §2.3：自进化优先修改 EvalRuleSet。
 */
export const EvalRuleSetSchema = z.object({
  /** 规则集唯一 ID。 */
  ruleSetId: IdSchema,
  /** 评估触发条件：最低失败率阈值（0~1）。 */
  failureRateThreshold: z.number().min(0).max(1).default(0.1),
  /** 评估周期（小时）。 */
  evaluationWindowHours: z.number().int().positive().default(72),
  /** 最低日志数阈值（样本不足时跳过评估）。 */
  minSampleSize: z.number().int().nonnegative().default(5),
  /** 连接器成功率红线（低于此值触发）。 */
  connectorSuccessRateFloor: z.number().min(0).max(1).default(0.9),
  /** 规则集版本。 */
  version: VersionSchema,
})
export type EvalRuleSet = z.infer<typeof EvalRuleSetSchema>

/**
 * HarnessBundle —— Harness 驾驭层配置包（契约表示）。
 *
 * Hermes 是 HarnessBundle 的 Source of Truth（CLAUDE.md §4.2）。
 * Bundle 聚合了自进化优先修改的全部七类 Runtime 对象（CLAUDE.md §2.3），
 * 是 Hermes ↔ OpenClaw 之间传递策略快照的核心载体。
 *
 * 版本化要求：CLAUDE.md §7.2 明确列出 HarnessBundle 为必须版本化的对象。
 */
export const HarnessBundleSchema = z.object({
  /** Bundle 唯一 ID。 */
  bundleId: IdSchema,
  /** 所属工作区 ID。 */
  workspaceId: IdSchema,
  /** Bundle 语义版本。 */
  version: VersionSchema,
  /** 工作流模板集合。 */
  workflowTemplates: z.array(WorkflowTemplateSchema).default([]),
  /** 智能体策略集合。 */
  agentPolicies: z.array(AgentPolicySchema).default([]),
  /** 技能绑定集合。 */
  skillBindings: z.array(SkillBindingSchema).default([]),
  /** 上下文策略。 */
  contextPolicy: ContextPolicySchema.optional(),
  /** 记忆策略。 */
  memoryPolicy: MemoryPolicySchema.optional(),
  /** 连接器策略集合。 */
  connectorPolicies: z.array(ConnectorPolicySchema).default([]),
  /** 评估规则集。 */
  evalRuleSet: EvalRuleSetSchema.optional(),
  /** 创建时间（ISO-8601）。 */
  createdAt: z.string(),
  /** 更新时间（ISO-8601）。 */
  updatedAt: z.string(),
})
export type HarnessBundle = z.infer<typeof HarnessBundleSchema>

/**
 * HarnessBundleStatus —— Bundle 生命周期状态（CLAUDE.md §4.2 / §8.1）。
 *
 * 合法状态机（在 src/lib/server/harness/bundle-state-machine.ts 中执行）：
 *   DRAFT  → CANARY
 *   CANARY → ACTIVE
 *   CANARY → ROLLED_BACK
 *   ACTIVE → DEPRECATED
 *   ACTIVE → ROLLED_BACK
 *
 * 持久层（Prisma）以 String 列承载该枚举（SQLite 无原生 enum），
 * 应用层入口处统一用本 schema 校验。
 */
export const HarnessBundleStatusSchema = z.enum([
  "DRAFT",
  "CANARY",
  "ACTIVE",
  "DEPRECATED",
  "ROLLED_BACK",
])
export type HarnessBundleStatus = z.infer<typeof HarnessBundleStatusSchema>

/**
 * BundleSnapshotReason —— 创建快照的原因分类（CLAUDE.md §4.5 / §8.1）。
 *
 * 三类语义：
 * - "pre-canary"     ：从 DRAFT 部署到 CANARY 之前
 * - "pre-activation" ：从 CANARY 全量激活到 ACTIVE 之前
 * - "manual"         ：人工显式触发的快照
 */
export const BundleSnapshotReasonSchema = z.enum([
  "pre-canary",
  "pre-activation",
  "manual",
])
export type BundleSnapshotReason = z.infer<typeof BundleSnapshotReasonSchema>
