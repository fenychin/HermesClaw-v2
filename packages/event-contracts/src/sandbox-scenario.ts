import { z } from "zod"
import {
  AutomationLevelSchema,
  IdSchema,
  TimestampSchema,
  VersionSchema,
} from "./shared"

/** SandboxScenarioRequest 独立契约版本。 */
export const SANDBOX_SCENARIO_REQUEST_VERSION = "1.0.0"

/**
 * SandboxScenarioRequest —— 沙盘推演提交请求。
 *
 * POST /api/v1/sandbox/submit 请求体。
 * 由前端 P4 板块 ScenarioInputForm 组件发起，A4 推演沙盘 Agent 消费。
 *
 * automationLevel 硬锁为 L1，前端不可修改 —— 推演结果仅为 AI 建议，不自动执行。
 */
export const SandboxScenarioRequestSchema = z.object({
  /** 请求唯一 ID。 */
  requestId: IdSchema,
  /** 租户 / 工作区 ID。 */
  workspaceId: IdSchema,
  /** 行业包 ID。 */
  industryId: IdSchema,
  /** 自动化授权等级 —— 固定 L1，前端不可覆盖。 */
  automationLevel: z.literal("L1"),
  /** 推演场景输入（键值对，由用户定义）。 */
  scenarioInput: z.record(z.string(), z.unknown()),
  /** 假设标签（人类可读的假设描述）。 */
  hypothesisLabel: z.string().min(1),
  /** 回调目标（topic / url / 队列名）。 */
  callbackTarget: IdSchema,
  /** 幂等键（前端生成，防重复提交）。 */
  idempotencyKey: IdSchema,
  /** 契约版本。 */
  version: VersionSchema,
})
export type SandboxScenarioRequest = z.infer<typeof SandboxScenarioRequestSchema>

// ─── ScenarioResult ────────────────────────────────────────────────────

/** ScenarioResult 独立契约版本。 */
export const SCENARIO_RESULT_VERSION = "1.0.0"

/**
 * 预测路径 —— ScenarioResult.paths 的子对象。
 *
 * 三条路径 PATH_A / PATH_B / PATH_C 分别对应最优/基准/最差情景。
 */
export const PredictionPathSchema = z.object({
  /** 路径标签。 */
  label: z.enum(["PATH_A", "PATH_B", "PATH_C"]),
  /** 路径人类可读描述。 */
  description: z.string().min(1),
  /** 胜率（0-1）。 */
  winRate: z.number().min(0).max(1),
  /** 时序数据点（用于 Chart.js 折线图渲染）。 */
  data: z.array(
    z.object({
      /** 时间点标签（如 "2026Q3"）。 */
      t: z.string().min(1),
      /** 该时间点的预测值。 */
      value: z.number(),
    }),
  ).min(1),
  /** 是否为推荐路径。 */
  isRecommended: z.boolean(),
})
export type PredictionPath = z.infer<typeof PredictionPathSchema>

/**
 * 行动建议 —— ScenarioResult.recommendations 的子对象。
 *
 * 所有建议必须标注「AI 建议 / 仅供参考」，不可自动执行。
 */
export const ActionRecommendationSchema = z.object({
  /** 建议唯一 ID。 */
  recommendationId: IdSchema,
  /** 建议标题。 */
  title: z.string().min(1),
  /** 建议详细描述。 */
  description: z.string().default(""),
  /** 建议优先级（1=最高 3=最低）。 */
  priority: z.number().int().min(1).max(3),
  /** 建议关联的路径标签。 */
  linkedPath: z.enum(["PATH_A", "PATH_B", "PATH_C"]),
  /** 预计影响描述。 */
  estimatedImpact: z.string().default(""),
})
export type ActionRecommendation = z.infer<typeof ActionRecommendationSchema>

/**
 * ScenarioResult —— 沙盘推演结果。
 *
 * GET /api/v1/sandbox/scenario-results/:id 响应体。
 * 由 A4 推演沙盘 Agent 产出，前端 P4 板块 ScenarioResultCard 消费。
 */
export const ScenarioResultSchema = z.object({
  /** 关联的 WorkflowRun ID。 */
  runId: IdSchema,
  /** 三条预测路径。 */
  paths: z.array(PredictionPathSchema).length(3),
  /** 行动建议列表。 */
  recommendations: z.array(ActionRecommendationSchema),
  /** 免责声明 —— 固定文本：「AI 建议 / 仅供参考」。 */
  disclaimer: z.string().min(1),
  /** 结果生成时刻（ISO-8601）。 */
  generatedAt: TimestampSchema,
  /** 契约版本。 */
  version: VersionSchema,
})
export type ScenarioResult = z.infer<typeof ScenarioResultSchema>
