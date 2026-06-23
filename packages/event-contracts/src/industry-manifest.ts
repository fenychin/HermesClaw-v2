import { z } from "zod"
import {
  IdSchema,
  VersionRangeSchema,
  VersionSchema,
} from "./shared"

/** IndustryManifest 独立契约版本。 */
export const INDUSTRY_MANIFEST_VERSION = "1.0.0"

/**
 * 行业包目录清单（CLAUDE.md §6.2 每个行业包必须提供的子目录）。
 *
 * IndustryManifest 声明的目录结构，用于校验行业包完整性。
 */
export const IndustryDirectorySchema = z.object({
  /** Agent 定义目录（必选）。 */
  agents: z.boolean().default(false),
  /** 工作流模板目录（必选）。 */
  workflows: z.boolean().default(false),
  /** 技能定义目录（必选）。 */
  skills: z.boolean().default(false),
  /** 行业知识目录（必选）。 */
  knowledge: z.boolean().default(false),
  /** 连接器定义目录（必选）。 */
  connectors: z.boolean().default(false),
  /** Schema 定义目录（必选）。 */
  schemas: z.boolean().default(false),
  /** 仪表板定义目录（必选）。 */
  dashboards: z.boolean().default(false),
  /** 评估规则目录（必选）。 */
  evalRules: z.boolean().default(false),
  /** Prompt 模板目录（CLAUDE.md §3.2 行业 prompt 必须随包发布，不得硬编码进核心）。 */
  prompts: z.boolean().default(false),
})
export type IndustryDirectory = z.infer<typeof IndustryDirectorySchema>

/**
 * 行业包迁移规则（CLAUDE.md §6.3）。
 *
 * 声明包版本间的不兼容迁移与回滚策略。
 */
export const MigrationRuleSchema = z.object({
  /** 迁移来源版本。 */
  fromVersion: VersionSchema,
  /** 迁移目标版本。 */
  toVersion: VersionSchema,
  /** 迁移描述（中文）。 */
  description: z.string().min(1),
  /** 是否为破坏性变更（需人工确认）。 */
  breaking: z.boolean().default(false),
  /** 回滚策略描述。 */
  rollbackStrategy: z.string().default(""),
})
export type MigrationRule = z.infer<typeof MigrationRuleSchema>

/**
 * IndustryManifest —— 行业包清单（契约表示）。
 *
 * 依据 CLAUDE.md §6.2-§6.3，每个行业包必须声明：
 * - 基本信息（名称、版本、描述）
 * - 兼容的 Hermes API / Runtime API 版本区间
 * - 迁移规则
 * - 目录结构声明
 *
 * 不兼容的行业包禁止装载（CLAUDE.md §6.3），
 * 装载阶段即应被 Industry Pack SDK 拒绝。
 */
export const IndustryManifestSchema = z.object({
  /** 行业包唯一标识。 */
  packId: IdSchema,
  /** 兼容简版 id 属性 */
  id: IdSchema.optional(),
  /** 行业包人类可读名称。 */
  name: z.string().min(1),
  /** 行业包语义版本。 */
  version: VersionSchema,
  /** 行业领域（如 foreign-trade、healthcare、finance）。 */
  industry: z.string().min(1),
  /** 行业包描述（中文）。 */
  description: z.string().default(""),
  /** 作者/维护者信息。 */
  author: z.string().default(""),
  /** 兼容的 Hermes API 版本区间（CLAUDE.md §6.3）。 */
  compatibleHermesApi: VersionRangeSchema,
  /** 兼容的 Runtime API 版本区间（CLAUDE.md §6.3）。 */
  compatibleRuntimeApi: VersionRangeSchema,
  /** 行业包依赖的其他包 ID 列表。 */
  dependencies: z.array(z.string()).default([]),
  /** 迁移规则列表（CLAUDE.md §6.3 migrationRules）。 */
  migrationRules: z.array(MigrationRuleSchema).default([]),
  /** 目录结构声明（CLAUDE.md §6.2）。 */
  directories: IndustryDirectorySchema.default({
    agents: false,
    workflows: false,
    skills: false,
    knowledge: false,
    connectors: false,
    schemas: false,
    dashboards: false,
    evalRules: false,
    prompts: false,
  }),
  /** 具体的资源目录（包含具体的资源 ID 列表）。 */
  directory: z.object({
    agents: z.array(z.string()).default([]),
    workflows: z.array(z.string()).default([]),
    skills: z.array(z.string()).default([]),
    connectors: z.array(z.string()).default([]),
    /** Prompt 模板键列表（如 ['workflow-templates']） */
    prompts: z.array(z.string()).default([]).optional(),
  }).optional(),
  /** 支持的语言列表。 */
  languages: z.array(z.string()).default(["zh-CN"]),
  /** 行业包激活状态。 */
  status: z.enum(["draft", "active", "deprecated", "archived"]).default("draft"),
  /** 创建时间（ISO-8601）。 */
  createdAt: z.string(),
  /** 更新时间（ISO-8601）。 */
  updatedAt: z.string(),
  /** 契约版本。 */
  version_field: VersionSchema,

  // ─── V2 门户升级专项扩展（Phase 2）───────────────────────────

  /** Dashboard 配置声明（每个 pack 可声明多个 dashboard）。 */
  dashboards: z
    .array(
      z.object({
        id: IdSchema,
        name: z.string().min(1),
        version: VersionSchema,
        description: z.string().default(""),
        /** 是否为行业情报中心大屏（五板块布局）。 */
        isIntelCenter: z.boolean().default(false),
      }),
    )
    .default([]),

  /** KPI Schema 声明（定义该行业包的 KPI 指标计算方式）。 */
  kpiSchemas: z
    .array(
      z.object({
        id: IdSchema,
        name: z.string().min(1),
        /** 指标计算方法：api(调用REST) / sse(实时推送) / computed(前端计算)。 */
        method: z.enum(["api", "sse", "computed"]),
        /** 数据源路径（如 /api/v1/industry/kpi-snapshot）。 */
        dataSource: z.string().min(1),
        /** 刷新间隔（秒）。 */
        refreshIntervalSec: z.number().int().nonnegative().default(30),
      }),
    )
    .default([]),

  /** Agent 绑定声明（Agent ID → 面板映射 + 心跳频率）。 */
  agentBindings: z
    .array(
      z.object({
        agentId: z.enum(["A1", "A2", "A3", "A4", "A5"]),
        panelId: z.enum(["P1", "P2", "P3", "P4", "P5"]),
        label: z.string().min(1),
        heartbeatIntervalSec: z.number().int().nonnegative(),
        automationLevel: z.enum(["L1", "L2"]),
        triggerType: z.enum(["scheduled", "event-driven", "user-initiated"]),
      }),
    )
    .default([]),

  /** SSE 订阅声明（前端按此建立 EventSource 连接）。 */
  sseSubscriptions: z
    .array(
      z.object({
        eventType: z.string().min(1),
        /** 消费面板 ID。 */
        panelId: z.enum(["P1", "P2", "P3", "P4", "P5"]),
        /** 优先级（P0 立即 / P1 ≤100ms / P2 ≤1s / P3 SWR 30s / P4 SWR 5min）。 */
        priority: z.enum(["P0", "P1", "P2", "P3", "P4"]),
        /** 前端本地缓冲大小。 */
        bufferSize: z.number().int().positive().default(50),
      }),
    )
    .default([]),

  /** 路由配置（深链接参数映射）。 */
  routeConfig: z
    .object({
      basePath: z.string().default("/industry-intelligence"),
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
    .optional(),
})
export type IndustryManifest = z.infer<typeof IndustryManifestSchema>
