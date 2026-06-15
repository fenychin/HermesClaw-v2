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
  }),
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
})
export type IndustryManifest = z.infer<typeof IndustryManifestSchema>
