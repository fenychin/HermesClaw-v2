import { z } from "zod"
import { IdSchema, VersionSchema } from "./shared"

/** DashboardConfig 独立契约版本。 */
export const DASHBOARD_CONFIG_VERSION = "1.0.0"

// ─── Panel 配置 ───────────────────────────────────────────────────────

/** 面板数据依赖声明 */
export const PanelDataDependencySchema = z.object({
  /** 依赖标识（如 "kpi-snapshot"）。 */
  key: z.string().min(1),
  /** 数据源类型：rest(API轮询) / sse(实时推送) / store(状态管理)。 */
  type: z.enum(["rest", "sse", "store"]),
  /** REST 端点或 SSE 事件类型。 */
  source: z.string().min(1),
  /** 是否必须在面板渲染前就绪。 */
  required: z.boolean().default(true),
  /** 刷新间隔（毫秒），rest 类型有效。 */
  refreshIntervalMs: z.number().int().positive().optional(),
})
export type PanelDataDependency = z.infer<typeof PanelDataDependencySchema>

/** Agent 心跳绑定 */
export const AgentHeartbeatBindingSchema = z.object({
  agentId: z.enum(["A1", "A2", "A3", "A4", "A5"]),
  label: z.string().min(1),
  heartbeatIntervalMs: z.number().int().positive(),
  /** 触发方式。 */
  triggerType: z.enum(["scheduled", "event-driven", "user-initiated"]),
  /** 自动化授权等级。 */
  automationLevel: z.enum(["L1", "L2"]),
  /** 关联的 WorkflowTemplate ID。 */
  workflowTemplateId: z.string().optional(),
  /** 关联的 Skill ID 列表。 */
  skillIds: z.array(z.string()).default([]),
})
export type AgentHeartbeatBinding = z.infer<typeof AgentHeartbeatBindingSchema>

/** SSE 事件订阅声明 */
export const SSESubscriptionSchema = z.object({
  eventType: z.string().min(1),
  /** 消费面板 ID。 */
  panelId: z.enum(["P1", "P2", "P3", "P4", "P5"]),
  /** 优先级。 */
  priority: z.enum(["P0", "P1", "P2", "P3", "P4"]),
  /** 前端本地缓冲大小。 */
  bufferSize: z.number().int().positive().default(50),
})
export type SSESubscription = z.infer<typeof SSESubscriptionSchema>

// ─── 单面板配置 ──────────────────────────────────────────────────────

export const PanelConfigSchema = z.object({
  /** 面板标识（P1-P5）。 */
  panelId: z.enum(["P1", "P2", "P3", "P4", "P5"]),
  /** 面板标题。 */
  title: z.string().min(1),
  /** 面板描述。 */
  description: z.string().default(""),
  /** 布局宽度百分比（16/20/28/20/16）。 */
  widthPct: z.number().int().min(5).max(50),
  /** 绑定的 Agent ID。 */
  agentId: z.enum(["A1", "A2", "A3", "A4", "A5"]),
  /** Agent 心跳间隔（毫秒）。 */
  heartbeatIntervalMs: z.number().int().positive(),
  /** 数据依赖列表。 */
  dataDependencies: z.array(PanelDataDependencySchema).default([]),
  /** SSE 订阅列表。 */
  sseSubscriptions: z.array(SSESubscriptionSchema).default([]),
  /** 前端渲染的根组件名（由前端映射，不在此校验组件存在性）。 */
  rootComponent: z.string().min(1),
  /** 深链接参数。 */
  deepLinkParam: z.string().optional(),
  /** 面板级刷新策略。 */
  refreshStrategy: z
    .object({
      /** SWR 刷新间隔（毫秒），0=不轮询。 */
      swrIntervalMs: z.number().int().nonnegative().default(0),
      /** 是否启用 SSE 增量更新。 */
      sseIncremental: z.boolean().default(false),
      /** 首次加载是否必须等待所有 required 依赖就绪。 */
      waitForRequired: z.boolean().default(true),
    })
    .default({ swrIntervalMs: 0, sseIncremental: false, waitForRequired: true }),
})
export type PanelConfig = z.infer<typeof PanelConfigSchema>

// ─── 布局配置 ─────────────────────────────────────────────────────────

export const LayoutConfigSchema = z.object({
  /** 默认模式（桌面端 1440px+）。 */
  default: z.object({
    columns: z.array(
      z.object({
        panels: z.array(z.enum(["P1", "P2", "P3", "P4", "P5"])),
        widthPct: z.number().int().positive(),
      }),
    ).length(5),
  }),
  /** 中屏模式（1280-1440px）。 */
  medium: z
    .object({
      columns: z.array(
        z.object({
          panels: z.array(z.enum(["P1", "P2", "P3", "P4", "P5"])),
          widthPct: z.number().int().positive(),
        }),
      ),
    })
    .optional(),
  /** 小屏模式（<1280px）。 */
  small: z
    .object({
      columns: z.array(
        z.object({
          panels: z.array(z.enum(["P1", "P2", "P3", "P4", "P5"])),
          widthPct: z.number().int().positive(),
        }),
      ),
    })
    .optional(),
})
export type LayoutConfig = z.infer<typeof LayoutConfigSchema>

// ─── 路由配置 ─────────────────────────────────────────────────────────

export const RouteConfigSchema = z.object({
  /** 页面路由路径。 */
  basePath: z.string().default("/industry-intelligence"),
  /** 深链接参数映射。 */
  deepLinks: z
    .array(
      z.object({
        param: z.string().min(1),
        panel: z.enum(["P1", "P2", "P3", "P4", "P5"]),
        description: z.string().default(""),
      }),
    )
    .default([]),
})
export type RouteConfig = z.infer<typeof RouteConfigSchema>

// ─── 性能阈值 ─────────────────────────────────────────────────────────

export const PerformanceThresholdsSchema = z.object({
  /** LCP 目标（毫秒）。 */
  lcpMs: z.number().int().positive().default(1500),
  /** INP 目标（毫秒）。 */
  inpMs: z.number().int().positive().default(150),
  /** CLS 上限。 */
  clsMax: z.number().min(0).max(1).default(0.05),
  /** SSE 重连超时（毫秒）。 */
  sseReconnectMs: z.number().int().positive().default(2000),
  /** 3D 渲染目标帧率。 */
  threeJsTargetFps: z.number().int().positive().default(60),
  /** 3D 自动降级帧率阈值。 */
  threeJsDegradeFps: z.number().int().positive().default(30),
  /** 内存上限（MB）。 */
  memoryLimitMb: z.number().int().positive().default(300),
})
export type PerformanceThresholds = z.infer<typeof PerformanceThresholdsSchema>

// ─── DashboardConfig 总定义 ──────────────────────────────────────────

/**
 * DashboardConfig —— 行业情报中心大屏配置。
 *
 * 此 schema 定义前端可消费的完整仪表板配置。
 * 由 Industry Pack SDK 从 manifest + dashboard.yaml 组装生成。
 *
 * 前端读取此配置后映射到具体 React 组件，实现：
 *   - 五板块布局
 *   - 每个 panel 的数据依赖
 *   - 心跳 Agent 绑定
 *   - 默认深链接参数
 *
 * 域归属：Industry Pack Layer 产出（dashboards/*.dashboard.yaml），
 * Hermes/OpenClaw 均不可直接写入。
 */
export const DashboardConfigSchema = z.object({
  /** Dashboard 唯一标识。 */
  dashboardId: IdSchema,
  /** 所属行业包 ID。 */
  packId: IdSchema,
  /** 行业领域。 */
  industry: z.string().min(1),
  /** Dashboard 名称。 */
  name: z.string().min(1),
  /** 描述。 */
  description: z.string().default(""),
  /** 语义版本。 */
  version: VersionSchema,

  /** 五面板配置。 */
  panels: z.array(PanelConfigSchema).length(5),

  /** 布局配置。 */
  layout: LayoutConfigSchema,

  /** 路由配置。 */
  route: RouteConfigSchema,

  /** Agent 心跳绑定（5 个 Agent）。 */
  agents: z.array(AgentHeartbeatBindingSchema).length(5),

  /** 性能阈值。 */
  performance: PerformanceThresholdsSchema,

  /** 兼容性声明。 */
  compatibleHermesApi: z.string().min(1),
  compatibleRuntimeApi: z.string().min(1),

  /** 迁移规则（升级/回滚）。 */
  migrationRules: z
    .array(
      z.object({
        fromVersion: VersionSchema,
        toVersion: VersionSchema,
        description: z.string().min(1),
        breaking: z.boolean().default(false),
        rollbackStrategy: z.string().default(""),
      }),
    )
    .default([]),

  /** 生成时刻。 */
  generatedAt: z.string(),

  /** 契约版本。 */
  contractVersion: VersionSchema,
})
export type DashboardConfig = z.infer<typeof DashboardConfigSchema>
