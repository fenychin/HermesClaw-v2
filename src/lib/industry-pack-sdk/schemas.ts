/**
 * Industry Pack SDK — Schema 定义
 *
 * 落地 CLAUDE.md §6 行业包实现规则：
 * - 所有 pack 资产（manifest / agents / workflows / prompts）以 Zod 单源校验。
 * - 装载阶段不通过即拒绝；不允许在运行期再做"宽容降级"。
 *
 * 复用关系：
 * - 顶层 IndustryManifestSchema 来自 src/contracts/industry-manifest.ts，本文件不重复定义。
 * - WorkflowDagFileSchema 复用 src/lib/server/workflow/dag-types.ts 的 WorkflowNode/Edge 类型
 *   （它们是节点级业务定义，不属于跨域契约，仅 SDK 内部使用）。
 */
import { z } from "zod"

// ─── Workflow 元数据（卡片信息） ──────────────────────────────────

/**
 * Workflow 元数据：用于 /foreign-trade 入口的卡片渲染，
 * 与 DAG 定义解耦——元数据可频繁更新而不触发 DAG 校验。
 */
export const WorkflowMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  /** Lucide 图标名称（字符串，由前端动态解析） */
  icon: z.string().optional(),
})
export type WorkflowMeta = z.infer<typeof WorkflowMetaSchema>

// ─── Workflow DAG 定义 ──────────────────────────────────────────

const WorkflowNodeKindSchema = z.enum([
  "task",
  "condition",
  "subworkflow",
  "skill",
  "data-write",
  "noop",
])

const WorkflowNodeSchema = z.object({
  id: z.string(),
  kind: WorkflowNodeKindSchema,
  name: z.string(),
  /** 节点配置（自由结构，由具体 kind 解释） */
  config: z.record(z.string(), z.unknown()).optional(),
  /** 节点 handler 标识（任务节点常用） */
  handler: z.string().optional(),
})

const WorkflowEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  /** 条件分支标签，必须与 condition 节点的 trueBranch / falseBranch 一致 */
  when: z.string().optional(),
})

/**
 * Workflow DAG 文件 schema（dag.json）
 *
 * 与 src/contracts/harness-bundle.ts 的 WorkflowTemplateSchema 区别：
 * - WorkflowTemplate 是跨域契约对象（agent ↔ harness 之间传递）
 * - WorkflowDagFile 是 pack 内部资产格式（SDK 装载后转化为 DB Workflow 表 + 跨域契约）
 */
export const WorkflowDagFileSchema = z.object({
  /** 与 meta.json 的 id 必须一致——SDK 装载时校验 */
  id: z.string(),
  /** 工作流名称（DB Workflow.name） */
  name: z.string(),
  description: z.string().default(""),
  /** DB Workflow.templateId */
  templateId: z.string().optional(),
  nodes: z.array(WorkflowNodeSchema).min(1),
  edges: z.array(WorkflowEdgeSchema),
  /** 依赖的 skill commandName 列表（对应 ft-* 命令） */
  requiredSkills: z.array(z.string()).default([]),
  /** 工作流默认自动化等级（节点级 config.automationLevel 优先） */
  automationLevel: z.enum(["L1", "L2", "L3", "L4"]).default("L2"),
  /** 工作流风险等级 */
  riskLevel: z.enum(["low", "medium", "high"]).default("medium"),
})
export type WorkflowDagFile = z.infer<typeof WorkflowDagFileSchema>

// ─── Workflow UI 步骤定义（steps.json） ──────────────────────────

const StepInputOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
})

const StepInputSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "textarea", "select"]),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  options: z.array(StepInputOptionSchema).optional(),
})

const StepOutputSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "markdown", "json"]),
})

const WorkflowStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(""),
  status: z.enum(["pending", "running", "completed", "failed", "skipped"]).default("pending"),
  inputs: z.array(StepInputSchema).optional(),
  outputs: z.array(StepOutputSchema).optional(),
})

/**
 * Workflow UI 步骤文件（steps.json）
 *
 * 用于前端 /foreign-trade/workflows/[id] 详情页渲染，与 DAG 是 1:N 关系
 * （一个 DAG 节点可能对应多个 UI 步骤，或多个节点合并为一个步骤）。
 */
export const WorkflowStepsFileSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(""),
  steps: z.array(WorkflowStepSchema).min(1),
})
export type WorkflowStepsFile = z.infer<typeof WorkflowStepsFileSchema>

// ─── Agent 定义（保持现有形态） ─────────────────────────────────

export const PackAgentAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  description: z.string(),
  status: z.string().optional(),
  source: z.string().optional(),
  category: z.array(z.string()).optional(),
  bindSkills: z.array(z.string()).optional(),
  bindConnectors: z.array(z.string()).optional(),
  memoryPermission: z.string().optional(),
  harnessVersion: z.string().optional(),
  automationLevel: z.string().optional(),
  canDo: z.array(z.string()).optional(),
  cannotDo: z.array(z.string()).optional(),
  stats: z.record(z.string(), z.unknown()).optional(),
  lastActive: z.string().optional(),
  createdAt: z.string().optional(),
  industryId: z.string().optional(),
  templateId: z.string().optional(),
})
export type PackAgentAsset = z.infer<typeof PackAgentAssetSchema>

// ─── Skill 岗位/动作定义 ──────────────────────────────────────────

export const PackSkillAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string().default("1.0.0"),
  category: z.string().default("foreign-trade"),
  status: z.string().default("active"),
})
export type PackSkillAsset = z.infer<typeof PackSkillAssetSchema>

// ─── 兼容旧 PackWorkflowAssetSchema 名称 ────────────────────────

/**
 * @deprecated 使用 WorkflowMetaSchema 替代。仅为兼容现有 import 保留。
 */
export const PackWorkflowAssetSchema = WorkflowMetaSchema
export type PackWorkflowAsset = WorkflowMeta

