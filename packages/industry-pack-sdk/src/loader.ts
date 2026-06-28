import { readFileSync, existsSync, readdirSync } from "fs"
import { join, resolve } from "path"
import yaml from "yaml"
import {
  IndustryManifestSchema,
  DashboardConfigSchema,
} from "@hermesclaw/event-contracts"
import type {
  IndustryManifest,
  DashboardConfig,
} from "@hermesclaw/event-contracts"
import {
  WorkflowMetaSchema,
  WorkflowDagFileSchema,
  WorkflowStepsFileSchema,
  PackAgentAssetSchema,
  PackSkillAssetSchema,
  type WorkflowMeta,
  type WorkflowDagFile,
  type WorkflowStepsFile,
  type PackAgentAsset,
  type PackSkillAsset,
} from "./schemas"
import { mapLegacyManifest } from "./legacy-mapper"
import type { IndustryPackLoaderOptions, IndustryPackAuditEvent } from "./types"
import { registerCriticalActionTypes } from "./critical-action-registry"

function resolvePacksDir(): string {
  const candidates = [
    join(process.cwd(), "industry-packs"),
    resolve(process.cwd(), "..", "industry-packs"),
    resolve(process.cwd(), "..", "..", "industry-packs"),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return candidates[candidates.length - 1]
}

const PACKS_DIR = resolvePacksDir()

// ─── 依赖注入：SDK 全局配置（三域原则） ──────────────────────────

/**
 * SDK 全局选项（进程级单例）
 *
 * 三域原则（CLAUDE.md §3.2、§6.1）：
 * - SDK 本身不 import @/、apps/web/、hermes-kernel、openclaw-adapter
 * - 所有外部依赖（审计、错误上报等）由主应用通过此选项注入
 * - 主应用应在进程启动时调用 configureIndustryPackLoader() 完成注入
 */
let _loaderOptions: IndustryPackLoaderOptions = {}

/**
 * 配置 Industry Pack Loader 的依赖注入选项
 *
 * 应在主应用进程启动时调用（通常位于 instrumentation.ts 或顶层 bootstrap 中）。
 * 不调用此函数时，SDK 以无审计模式运行（静默跳过所有回调）。
 *
 * @example
 * ```ts
 * import { configureIndustryPackLoader } from "@hermesclaw/industry-pack-sdk"
 * import { writeAuditLog } from "@/lib/server/audit"
 *
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
export function configureIndustryPackLoader(options: IndustryPackLoaderOptions): void {
  _loaderOptions = { ...options }
}

/**
 * 获取当前 SDK 全局配置（仅供内部使用）
 */
function getLoaderOptions(): IndustryPackLoaderOptions {
  return _loaderOptions
}

// ─── 内部辅助：触发审计回调 ──────────────────────────────────────

function emitAuditEvent(event: IndustryPackAuditEvent): void {
  const { onAuditLog } = _loaderOptions
  if (!onAuditLog) return
  // 异步执行，不阻塞加载流程
  void (async () => {
    try {
      await onAuditLog(event)
    } catch {
      // 审计回调失败不得阻断主流程
    }
  })()
}

// ─── 进程级缓存（按 packId / workflowId 维度） ────────────────────

const manifestCache = new Map<string, IndustryManifest>()
const workflowMetasCache = new Map<string, WorkflowMeta[]>()
const workflowDagCache = new Map<string, WorkflowDagFile>()
const workflowStepsCache = new Map<string, WorkflowStepsFile>()
const agentsCache = new Map<string, PackAgentAsset[]>()
const skillsCache = new Map<string, PackSkillAsset[]>()
const promptCache = new Map<string, string>()

// ─── 工具：packId 合法性校验（防 path traversal） ────────────────

function assertSafePackId(packId: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(packId)) {
    throw new Error(
      `Invalid packId format: ${packId}. Only alphanumeric characters, dashes and underscores are allowed.`,
    )
  }
}

function assertSafeAssetId(assetId: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(assetId)) {
    throw new Error(
      `Invalid assetId format: ${assetId}. Only alphanumeric characters, dashes and underscores are allowed.`,
    )
  }
}

/**
 * 通用文件资源读取工具：优先尝试 .yaml 和 .yml，最后退化尝试 .json
 */
function readAssetFile(basePathWithoutExt: string): { parsed: any; ext: string } {
  const exts = [
    ".yaml",
    ".yml",
    ".json",
    ".skill.yaml",
    ".workflow.yaml",
    ".dashboard.yaml",
    ".eval.yaml",
    ".connector.yaml",
  ];
  for (const ext of exts) {
    const filePath = basePathWithoutExt + ext;
    if (existsSync(filePath)) {
      const rawText = readFileSync(filePath, "utf-8");
      if (ext === ".json") {
        return { parsed: JSON.parse(rawText), ext };
      } else {
        return { parsed: yaml.parse(rawText), ext };
      }
    }
  }
  throw new Error(`File not found: ${basePathWithoutExt} (tried .yaml, .yml, .json)`);
}

// ─── Manifest ────────────────────────────────────────────────────

export function loadIndustryManifest(packId: string): IndustryManifest {
  assertSafePackId(packId)

  // PERF(v3.42.05): 进程级缓存 — 避免每次 Agent 心跳（A2 每 3s）都 readFileSync
  // 阻塞 Node.js 事件循环，导致 SSE/API 全部卡死。
  if (manifestCache.has(packId)) {
    return manifestCache.get(packId)!
  }

  try {
    const basePath = join(PACKS_DIR, packId, "manifest")
    const { parsed } = readAssetFile(basePath)
    const mapped = mapLegacyManifest(parsed)
    const manifest = IndustryManifestSchema.parse(mapped)

    manifestCache.set(packId, manifest)

    // 注册该行业包声明的高危动作类型，供 Hermes 控制平面查询。
    // 三域原则：行业包自声明，核心不硬编码。
    registerCriticalActionTypes(packId, manifest.criticalActionTypes)

    // 通过 DI 回调通知主应用记录审计日志（不阻塞加载流程）
    // 三域原则：SDK 不直接依赖 @/lib/server/audit，由主应用注入 onAuditLog
    emitAuditEvent({
      type: "PACK_LOADED",
      packId,
      timestamp: new Date().toISOString(),
      detail: { name: manifest.name, version: manifest.version },
    })

    return manifest
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("File not found")) {
      throw new Error(`Industry pack manifest not found for packId: ${packId}`)
    }
    throw new Error(`Failed to parse industry pack manifest for packId: ${packId}: ${message}`)
  }
}

export function setCachedManifest(packId: string, manifest: IndustryManifest): void {
  manifestCache.set(packId, manifest)
}

export function getCachedManifest(packId: string): IndustryManifest {
  if (!manifestCache.has(packId)) {
    manifestCache.set(packId, loadIndustryManifest(packId))
  }
  return manifestCache.get(packId)!
}

// ─── Workflow 元数据列表 ─────────────────────────────────────────

export function listIndustryWorkflows(packId: string): WorkflowMeta[] {
  if (workflowMetasCache.has(packId)) {
    return workflowMetasCache.get(packId)!
  }

  const manifest = getCachedManifest(packId)
  const wfIds = manifest.directory?.workflows || []
  const metas: WorkflowMeta[] = []

  for (const wfId of wfIds) {
    assertSafeAssetId(wfId)
    metas.push(loadWorkflowMeta(packId, wfId))
  }

  workflowMetasCache.set(packId, metas)
  return metas
}

function loadWorkflowMeta(packId: string, wfId: string): WorkflowMeta {
  // 优先 v2 目录形式 (workflows/<wfId>/meta.*)
  const basePathV2 = join(PACKS_DIR, packId, "workflows", wfId, "meta")
  // 兼容 v1 扁平形式 (workflows/<wfId>.*)
  const basePathV1 = join(PACKS_DIR, packId, "workflows", wfId)

  for (const basePath of [basePathV2, basePathV1]) {
    try {
      const { parsed } = readAssetFile(basePath)
      return WorkflowMetaSchema.parse(parsed)
    } catch (error) {
      if (error instanceof Error && error.message.includes("File not found")) {
        continue
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load workflow meta: ${wfId} in pack: ${packId}. Error: ${message}`)
    }
  }

  throw new Error(`Workflow meta not found: ${wfId} in pack: ${packId} (tried v2 and v1 formats)`)
}

/**
 * @deprecated 使用 listIndustryWorkflows 替代。仅为兼容旧调用保留。
 */
export const loadIndustryWorkflows = listIndustryWorkflows

// ─── Workflow DAG ───────────────────────────────────────────────

export function loadIndustryWorkflowDag(
  packId: string,
  wfId: string,
): WorkflowDagFile | null {
  assertSafePackId(packId)
  assertSafeAssetId(wfId)

  const cacheKey = `${packId}::${wfId}`
  if (workflowDagCache.has(cacheKey)) {
    return workflowDagCache.get(cacheKey)!
  }

  const dagPath = join(PACKS_DIR, packId, "workflows", wfId, "dag")
  try {
    const { parsed } = readAssetFile(dagPath)
    const verified = WorkflowDagFileSchema.parse(parsed)
    if (verified.id !== wfId) {
      throw new Error(`DAG id mismatch: file declares id="${verified.id}" but located under workflows/${wfId}/`)
    }
    workflowDagCache.set(cacheKey, verified)
    return verified
  } catch (error) {
    if (error instanceof Error && error.message.includes("File not found")) {
      return null
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load workflow DAG: ${wfId} in pack: ${packId}. Error: ${message}`)
  }
}

// ─── Workflow UI 步骤定义 ───────────────────────────────────────────

export function loadIndustryWorkflowSteps(
  packId: string,
  wfId: string,
): WorkflowStepsFile | null {
  assertSafePackId(packId)
  assertSafeAssetId(wfId)

  const cacheKey = `${packId}::${wfId}`
  if (workflowStepsCache.has(cacheKey)) {
    return workflowStepsCache.get(cacheKey)!
  }

  const stepsPath = join(PACKS_DIR, packId, "workflows", wfId, "steps")
  try {
    const { parsed } = readAssetFile(stepsPath)
    const verified = WorkflowStepsFileSchema.parse(parsed)
    if (verified.id !== wfId) {
      throw new Error(`Steps id mismatch: file declares id="${verified.id}" but located under workflows/${wfId}/`)
    }
    workflowStepsCache.set(cacheKey, verified)
    return verified
  } catch (error) {
    if (error instanceof Error && error.message.includes("File not found")) {
      return null
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load workflow steps: ${wfId} in pack: ${packId}. Error: ${message}`)
  }
}

export function loadIndustryWorkflow(
  packId: string,
  wfId: string,
): {
  meta: WorkflowMeta
  dag: WorkflowDagFile | null
  steps: WorkflowStepsFile | null
} {
  return {
    meta: loadWorkflowMeta(packId, wfId),
    dag: loadIndustryWorkflowDag(packId, wfId),
    steps: loadIndustryWorkflowSteps(packId, wfId),
  }
}

// ─── Agents ─────────────────────────────────────────────────────

export function loadIndustryAgents(packId: string): PackAgentAsset[] {
  if (agentsCache.has(packId)) {
    return agentsCache.get(packId)!
  }

  const manifest = getCachedManifest(packId)
  const agentIds = manifest.directory?.agents || []
  const agents: PackAgentAsset[] = []

  for (const agentId of agentIds) {
    assertSafeAssetId(agentId)
    const basePath = join(PACKS_DIR, packId, "agents", agentId)
    try {
      const { parsed } = readAssetFile(basePath)
      const verified = PackAgentAssetSchema.parse(parsed)
      agents.push(verified)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load agent asset: ${agentId} in pack: ${packId}. Error: ${message}`)
    }
  }

  agentsCache.set(packId, agents)
  return agents
}

// ─── Prompts ────────────────────────────────────────────────────

export function loadIndustryPrompt(packId: string, key: string): string | null {
  assertSafePackId(packId)
  assertSafeAssetId(key)

  const cacheKey = `${packId}::${key}`
  if (promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey)!
  }

  const promptPath = join(PACKS_DIR, packId, "prompts", `${key}.md`)
  try {
    const text = readFileSync(promptPath, "utf-8")
    promptCache.set(cacheKey, text)
    return text
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null
    }
    throw error
  }
}

// ─── Skills ─────────────────────────────────────────────────────

export function loadIndustrySkills(packId: string): PackSkillAsset[] {
  if (skillsCache.has(packId)) {
    return skillsCache.get(packId)!
  }

  const manifest = getCachedManifest(packId)
  const skillIds = manifest.directory?.skills || []
  const skills: PackSkillAsset[] = []

  for (const skillId of skillIds) {
    assertSafeAssetId(skillId)
    const basePath = join(PACKS_DIR, packId, "skills", skillId)
    try {
      const { parsed } = readAssetFile(basePath)
      const verified = (() => {
        try {
          return PackSkillAssetSchema.parse(parsed)
        } catch {
          const raw = parsed as Record<string, unknown>
          return PackSkillAssetSchema.parse({
            id: typeof raw.id === "string" ? raw.id : skillId,
            name: typeof raw.displayName === "string" ? raw.displayName : typeof raw.name === "string" ? raw.name : skillId,
            description: typeof raw.description === "string" ? raw.description : "",
            version: typeof raw.version === "string" ? raw.version : "1.0.0",
            category: typeof raw.category === "string" ? raw.category : "foreign-trade",
            status: typeof raw.status === "string" ? raw.status : "active",
          })
        }
      })()
      skills.push(verified)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load skill asset: ${skillId} in pack: ${packId}. Error: ${message}`)
    }
  }

  skillsCache.set(packId, skills)
  return skills
}

// ─── Schemas ────────────────────────────────────────────────────

export function loadIndustrySchemas(packId: string): any[] {
  assertSafePackId(packId)
  const dirPath = join(PACKS_DIR, packId, "schemas")
  if (!existsSync(dirPath)) return []

  const files = readdirSync(dirPath)
  const schemas: any[] = []
  for (const file of files) {
    if (file.endsWith(".yaml") || file.endsWith(".yml") || file.endsWith(".json")) {
      const ext = file.endsWith(".json") ? ".json" : (file.endsWith(".yml") ? ".yml" : ".yaml")
      const nameWithoutExt = file.slice(0, -ext.length)
      try {
        const { parsed } = readAssetFile(join(dirPath, nameWithoutExt))
        schemas.push(parsed)
      } catch (err) {
        console.error(`Failed to load schema ${file}:`, err)
      }
    }
  }
  return schemas
}

// ─── Eval Rules ─────────────────────────────────────────────────

export function loadIndustryEvalRules(packId: string): any[] {
  assertSafePackId(packId)
  const dirPath = join(PACKS_DIR, packId, "eval-rules")
  if (!existsSync(dirPath)) return []

  const files = readdirSync(dirPath)
  const evalRules: any[] = []
  for (const file of files) {
    if (file.endsWith(".yaml") || file.endsWith(".yml") || file.endsWith(".json")) {
      const ext = file.endsWith(".json") ? ".json" : (file.endsWith(".yml") ? ".yml" : ".yaml")
      const nameWithoutExt = file.slice(0, -ext.length)
      try {
        const { parsed } = readAssetFile(join(dirPath, nameWithoutExt))
        evalRules.push(parsed)
      } catch (err) {
        console.error(`Failed to load eval rule ${file}:`, err)
      }
    }
  }
  return evalRules
}

// ─── 新增：加载行业 Dashboards 资产 ─────────────────────────────────

export function loadIndustryDashboards(packId: string): any[] {
  assertSafePackId(packId)
  const dirPath = join(PACKS_DIR, packId, "dashboards")
  if (!existsSync(dirPath)) return []

  const files = readdirSync(dirPath)
  const dashboards: any[] = []
  for (const file of files) {
    if (file.endsWith(".yaml") || file.endsWith(".yml") || file.endsWith(".json")) {
      const ext = file.endsWith(".json") ? ".json" : (file.endsWith(".yml") ? ".yml" : ".yaml")
      const nameWithoutExt = file.slice(0, -ext.length)
      try {
        const { parsed } = readAssetFile(join(dirPath, nameWithoutExt))
        dashboards.push(parsed)
      } catch (err) {
        console.error(`Failed to load dashboard ${file}:`, err)
      }
    }
  }
  return dashboards
}

// ─── 新增：加载行业 Connectors Mapping 资产 ──────────────────────────

export function loadIndustryConnectors(packId: string): any[] {
  assertSafePackId(packId)
  const dirPath = join(PACKS_DIR, packId, "connectors")
  if (!existsSync(dirPath)) return []

  const files = readdirSync(dirPath)
  const connectors: any[] = []
  for (const file of files) {
    if (file.endsWith(".yaml") || file.endsWith(".yml") || file.endsWith(".json")) {
      const ext = file.endsWith(".json") ? ".json" : (file.endsWith(".yml") ? ".yml" : ".yaml")
      const nameWithoutExt = file.slice(0, -ext.length)
      try {
        const { parsed } = readAssetFile(join(dirPath, nameWithoutExt))
        connectors.push(parsed)
      } catch (err) {
        console.error(`Failed to load connector ${file}:`, err)
      }
    }
  }
  return connectors
}

// ─── 缓存清理 ───────────────────────────────────────────────────

export function clearCache(packId?: string): void {
  if (packId) {
    manifestCache.delete(packId)
    workflowMetasCache.delete(packId)
    agentsCache.delete(packId)
    skillsCache.delete(packId)
    for (const key of workflowDagCache.keys()) {
      if (key.startsWith(`${packId}::`)) workflowDagCache.delete(key)
    }
    for (const key of workflowStepsCache.keys()) {
      if (key.startsWith(`${packId}::`)) workflowStepsCache.delete(key)
    }
    for (const key of promptCache.keys()) {
      if (key.startsWith(`${packId}::`)) promptCache.delete(key)
    }
  } else {
    manifestCache.clear()
    workflowMetasCache.clear()
    workflowDagCache.clear()
    workflowStepsCache.clear()
    agentsCache.clear()
    skillsCache.clear()
    promptCache.clear()
  }
}

export const clearManifestCache = clearCache

// ─── Dashboard 配置加载与校验（Phase 2） ─────────────────────────

const dashboardConfigCache = new Map<string, DashboardConfig>()

/**
 * 加载行业包的 Dashboard 配置并校验。
 *
 * 从 dashboards/ 目录读取 YAML，经 DashboardConfigSchema 强校验后，
 * 生成前端可直接消费的 DashboardConfig JSON。
 *
 * 校验失败时触发 DASHBOARD_REJECTED 审计事件并抛出。
 *
 * @param packId 行业包 ID
 * @param dashboardId 指定 dashboard ID，不传则加载第一个
 * @returns 通过 Zod 校验的 DashboardConfig
 * @throws 文件不存在 / schema 校验失败时抛出
 */
export function loadIndustryDashboardConfig(
  packId: string,
  dashboardId?: string,
): DashboardConfig {
  assertSafePackId(packId)

  const cacheKey = dashboardId ? `${packId}::${dashboardId}` : `${packId}::default`
  if (dashboardConfigCache.has(cacheKey)) {
    return dashboardConfigCache.get(cacheKey)!
  }

  const dashboards = loadIndustryDashboards(packId)
  if (dashboards.length === 0) {
    throw new Error(`No dashboards found for packId: ${packId}`)
  }

  const raw = dashboardId
    ? dashboards.find((d: Record<string, unknown>) => d.dashboardId === dashboardId)
    : dashboards[0]

  if (!raw) {
    throw new Error(
      `Dashboard "${dashboardId}" not found in pack: ${packId}. Available: ${
        dashboards.map((d: Record<string, unknown>) => d.dashboardId).join(", ")
      }`,
    )
  }

  const result = DashboardConfigSchema.safeParse(raw)
  if (!result.success) {
    const detail = {
      errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    }
    emitAuditEvent({
      type: "DASHBOARD_REJECTED",
      packId,
      timestamp: new Date().toISOString(),
      detail,
    })
    throw new Error(
      `Dashboard config validation failed for pack: ${packId}: ${JSON.stringify(detail.errors)}`,
    )
  }

  const config = result.data

  // 交叉校验：dashboard 中声明的 panel agentId 必须与 manifest agentBindings 一致
  const manifest = getCachedManifest(packId)
  const manifestAgentBindings = manifest.agentBindings || []
  const manifestAgentIds = new Set(manifestAgentBindings.map((b) => b.agentId))

  for (const panel of config.panels) {
    if (!manifestAgentIds.has(panel.agentId)) {
      throw new Error(
        `Dashboard panel ${panel.panelId} references agentId "${panel.agentId}" ` +
        `not declared in manifest agentBindings. Known agents: ${[...manifestAgentIds].join(", ")}`,
      )
    }
  }

  dashboardConfigCache.set(cacheKey, config)

  emitAuditEvent({
    type: "DASHBOARD_LOADED",
    packId,
    timestamp: new Date().toISOString(),
    detail: {
      dashboardId: config.dashboardId,
      version: config.version,
      panels: config.panels.length,
    },
  })

  return config
}

// ─── 兼容性校验（Phase 2） ────────────────────────────────────────

/**
 * 语义版本比较。
 * 将 semver 字符串转为 [major, minor, patch] 数组后逐段比较。
 * 返回 1（a > b）、0（相等）、-1（a < b）。
 */
function compareSemver(a: string, b: string): number {
  const aParts = a.split(".").map(Number)
  const bParts = b.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    if (aParts[i] > bParts[i]) return 1
    if (aParts[i] < bParts[i]) return -1
  }
  return 0
}

/**
 * 检查单个版本号是否落在 VersionRange 范围内。
 * min ≤ version ≤ max。
 */
function versionInRange(version: string, range: { min: string; max: string }): boolean {
  return compareSemver(version, range.min) >= 0 && compareSemver(version, range.max) <= 0
}

/**
 * 校验行业包的兼容性声明。
 *
 * 依据 CLAUDE.md §6.3，以下三项缺一不可：
 * 1. `compatibleHermesApi` — 包声明的 Hermes API 版本区间
 * 2. `compatibleRuntimeApi` — 包声明的 Runtime API 版本区间
 * 3. `migrationRules` — 至少包含一条迁移规则（fromVersion → toVersion）
 *
 * 校验逻辑：
 * - 将当前 Hermes API / Runtime API 版本与包的 VersionRange 比较
 * - 检查 migrationRules 是否覆盖了当前包的 fromVersion → toVersion
 * - 任何一项不通过则返回 passed: false 并列出 failures
 *
 * @param packId 行业包 ID
 * @param currentHermesVersion 当前 Hermes API 版本（如 "1.0.0"）
 * @param currentRuntimeVersion 当前 Runtime API 版本（如 "1.0.0"）
 * @returns CompatibilityCheckResult
 */
export function validateIndustryPackCompatibility(
  packId: string,
  currentHermesVersion: string,
  currentRuntimeVersion: string,
): import("./types").CompatibilityCheckResult {
  const manifest = getCachedManifest(packId)
  const failures: string[] = []
  let hermesCompatible = false
  let runtimeCompatible = false

  // 检查 Hermes API 兼容性
  const hermesRange = manifest.compatibleHermesApi
  if (hermesRange && hermesRange.min && hermesRange.max) {
    hermesCompatible = versionInRange(currentHermesVersion, hermesRange as { min: string; max: string })
    if (!hermesCompatible) {
      failures.push(
        `Hermes API: pack requires ${hermesRange.min}-${hermesRange.max}, current is ${currentHermesVersion}`,
      )
    }
  } else {
    failures.push("Hermes API: pack manifest missing compatibleHermesApi declaration")
  }

  // 检查 Runtime API 兼容性
  const runtimeRange = manifest.compatibleRuntimeApi
  if (runtimeRange && runtimeRange.min && runtimeRange.max) {
    runtimeCompatible = versionInRange(currentRuntimeVersion, runtimeRange as { min: string; max: string })
    if (!runtimeCompatible) {
      failures.push(
        `Runtime API: pack requires ${runtimeRange.min}-${runtimeRange.max}, current is ${currentRuntimeVersion}`,
      )
    }
  } else {
    failures.push("Runtime API: pack manifest missing compatibleRuntimeApi declaration")
  }

  // 检查 migrationRules 完整性
  const migrationRules = manifest.migrationRules || []
  const missingMigrationRules: string[] = []
  if (migrationRules.length === 0) {
    missingMigrationRules.push("no migration rules defined")
    failures.push("Migration: pack manifest must declare at least one migrationRule")
  } else {
    // 检查是否存在覆盖当前版本的迁移规则
    const currentVersion = manifest.version
    const hasMigrationForCurrent = migrationRules.some(
      (r) => r.toVersion === currentVersion,
    )
    if (!hasMigrationForCurrent) {
      missingMigrationRules.push(`missing migration rule for toVersion=${currentVersion}`)
      failures.push(
        `Migration: no migrationRule found covering toVersion=${currentVersion}`,
      )
    }
  }

  const passed = failures.length === 0

  const eventType = passed ? "COMPATIBILITY_CHECK_PASSED" : "COMPATIBILITY_CHECK_FAILED"
  emitAuditEvent({
    type: eventType,
    packId,
    timestamp: new Date().toISOString(),
    detail: {
      hermesCompatible,
      runtimeCompatible,
      missingMigrationRules,
      failures,
      currentHermesVersion,
      currentRuntimeVersion,
    },
  })

  return {
    passed,
    hermesCompatible,
    runtimeCompatible,
    missingMigrationRules,
    failures,
    checkedAt: new Date().toISOString(),
  }
}

// ─── 新增：IndustryPackLoader 边界守护类（三域原则第三域） ────────────────
import { IndustryPackManifestSchema, type IndustryPackManifest } from './types'

export class IndustryPackLoader {
  private loaded = new Map<string, IndustryPackManifest>()

  load(manifest: unknown): IndustryPackManifest {
    const result = IndustryPackManifestSchema.safeParse(manifest)
    if (!result.success) {
      throw new Error(`Invalid Industry Pack manifest: ${result.error.message}`)
    }
    // 域边界检查：Pack 不能声明会影响核心域权限的字段
    this.assertDomainBoundary(result.data)
    this.loaded.set(result.data.packId, result.data)
    return result.data
  }

  private assertDomainBoundary(pack: IndustryPackManifest) {
    // 检查 Pack 是否试图越权（例如注入执行权限配置）
    // 此处可实现具体的越权判定逻辑（当前为桩）
  }

  getSystemPrompts(packId: string, role: string): string | undefined {
    return this.loaded.get(packId)?.assets.systemPrompts?.[role]
  }
}

