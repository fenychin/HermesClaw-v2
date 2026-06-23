import { z } from 'zod'

/**
 * Industry Pack Manifest Schema
 * 三域原则第三域的唯一注入接口
 * Pack 只能通过此 schema 声明资产，不能引用 hermes-kernel 或 openclaw-adapter 内部
 */
export const IndustryPackManifestSchema = z.object({
  packId: z.string().regex(/^[a-z0-9-]+$/),
  version: z.string(),
  domain: z.string(),           // 行业域（如 "foreign-trade"）
  locale: z.string().default('zh-CN'),
  // 允许注入的资产类型
  assets: z.object({
    systemPrompts: z.record(z.string(), z.string()).optional(),
    workflowTemplates: z.array(z.object({
      id: z.string(),
      name: z.string(),
      steps: z.array(z.unknown()),
    })).optional(),
    skillDefinitions: z.array(z.unknown()).optional(),
    kpiDefinitions: z.array(z.unknown()).optional(),
  }),
})

export type IndustryPackManifest = z.infer<typeof IndustryPackManifestSchema>

// ─── 依赖注入点：IndustryPackLoaderOptions ──────────────────────────

/**
 * Industry Pack 审计事件类型
 *
 * 三域原则要求 SDK 不依赖任何主应用实现（如 @/lib/server/audit），
 * 而是通过此事件类型暴露审计需求，由主应用通过 onAuditLog 回调注入。
 */
export interface IndustryPackAuditEvent {
  /** 事件类型 */
  type:
    | "PACK_LOADED"
    | "PACK_REJECTED"
    | "BOUNDARY_VIOLATION"
    | "DASHBOARD_LOADED"
    | "DASHBOARD_REJECTED"
    | "COMPATIBILITY_CHECK_PASSED"
    | "COMPATIBILITY_CHECK_FAILED"
  /** 行业包 ID */
  packId: string
  /** ISO-8601 时间戳 */
  timestamp: string
  /** 附加上下文 */
  detail?: Record<string, unknown>
}

/** 兼容性校验结果 */
export interface CompatibilityCheckResult {
  /** 是否通过兼容性检查。 */
  passed: boolean
  /** Hermes API 兼容性。 */
  hermesCompatible: boolean
  /** Runtime API 兼容性。 */
  runtimeCompatible: boolean
  /** 缺失的迁移规则版本对。 */
  missingMigrationRules: string[]
  /** 失败原因描述列表。 */
  failures: string[]
  /** 检查时间。 */
  checkedAt: string
}

/**
 * Industry Pack Loader 的依赖注入配置
 *
 * 三域原则（CLAUDE.md §3.2）：
 * - SDK 本身不 import @/、apps/web/、hermes-kernel、openclaw-adapter
 * - 所有外部依赖（审计、错误上报等）由主应用通过此接口注入
 */
export interface IndustryPackLoaderOptions {
  /**
   * 可选的审计日志回调
   * 由主应用（调用方）注入，SDK 本身不依赖任何具体实现
   *
   * @example
   * ```ts
   * import { writeAuditLog } from "@/lib/server/audit"
   * configureIndustryPackLoader({
   *   onAuditLog: async (event) => {
   *     await writeAuditLog({
   *       actor: "system",
   *       action: `industry.pack.${event.type.toLowerCase()}`,
   *       targetType: "industry-pack",
   *       targetId: event.packId,
   *       detail: JSON.stringify(event.detail),
   *       riskLevel: "medium",
   *       workspaceId: "default",
   *     })
   *   },
   * })
   * ```
   */
  onAuditLog?: (event: IndustryPackAuditEvent) => Promise<void> | void

  /**
   * 可选的加载错误回调
   * 用于主应用统一错误上报（如 Sentry、日志系统）
   */
  onLoadError?: (packId: string, error: Error) => void
}
