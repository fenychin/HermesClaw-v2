/**
 * Industry Pack SDK — 装载器
 *
 * 落地 CLAUDE.md §6 行业包实现规则：
 * - 装载阶段经 Zod 强校验，不通过即拒绝（不允许运行期"宽容降级"）。
 * - 所有装载结果带进程级缓存，避免每次 API 请求重读磁盘。
 *
 * 来源：原 src/lib/server/industry-pack-loader.ts，按 SDK 边界拆分：
 * - schemas.ts — schema 定义
 * - legacy-mapper.ts — 兼容旧 manifest 格式
 * - loader.ts — 物理装载逻辑（本文件）
 *
 * SDK 公开 API（见 index.ts）：
 * - loadIndustryManifest / getCachedManifest
 * - listIndustryWorkflows（卡片元数据）
 * - loadIndustryWorkflowDag（DAG 定义）
 * - loadIndustryWorkflowSteps（UI 步骤）
 * - loadIndustryWorkflow（一次性返回 meta + dag + steps）
 * - loadIndustryAgents
 * - loadIndustryPrompt
 * - clearCache
 */
import { readFileSync } from "fs"
import { join } from "path"
import { IndustryManifestSchema } from "@/contracts"
import type { IndustryManifest } from "@/contracts"
import {
  WorkflowMetaSchema,
  WorkflowDagFileSchema,
  WorkflowStepsFileSchema,
  PackAgentAssetSchema,
  type WorkflowMeta,
  type WorkflowDagFile,
  type WorkflowStepsFile,
  type PackAgentAsset,
} from "./schemas"
import { mapLegacyManifest } from "./legacy-mapper"

const PACKS_DIR = join(process.cwd(), "industry-packs")

// ─── 进程级缓存（按 packId / workflowId 维度） ────────────────────

const manifestCache = new Map<string, IndustryManifest>()
const workflowMetasCache = new Map<string, WorkflowMeta[]>()
const workflowDagCache = new Map<string, WorkflowDagFile>()
const workflowStepsCache = new Map<string, WorkflowStepsFile>()
const agentsCache = new Map<string, PackAgentAsset[]>()
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

// ─── Manifest ────────────────────────────────────────────────────

export function loadIndustryManifest(packId: string): IndustryManifest {
  assertSafePackId(packId)
  const filePath = join(PACKS_DIR, packId, "manifest.json")

  let rawText: string
  try {
    rawText = readFileSync(filePath, "utf-8")
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Industry pack manifest not found for packId: ${packId}`)
    }
    throw error
  }

  try {
    const raw = JSON.parse(rawText)
    const mapped = mapLegacyManifest(raw)
    return IndustryManifestSchema.parse(mapped)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse industry pack manifest for packId: ${packId}: ${message}`)
  }
}

export function getCachedManifest(packId: string): IndustryManifest {
  if (!manifestCache.has(packId)) {
    manifestCache.set(packId, loadIndustryManifest(packId))
  }
  return manifestCache.get(packId)!
}

// ─── Workflow 元数据列表 ─────────────────────────────────────────

/**
 * 列出指定行业包内全部 workflow 卡片元数据。
 *
 * 物理布局（v2，单文件 → 目录形式）：
 *   industry-packs/<packId>/workflows/<wfId>/meta.json
 *
 * 兼容旧布局（v1，扁平 .json）：
 *   industry-packs/<packId>/workflows/<wfId>.json
 *
 * 优先尝试 v2 目录，未命中再回退到 v1 文件，确保平滑迁移期可用。
 */
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
  // 优先 v2 目录形式
  const metaPathV2 = join(PACKS_DIR, packId, "workflows", wfId, "meta.json")
  // 兼容 v1 扁平形式
  const metaPathV1 = join(PACKS_DIR, packId, "workflows", `${wfId}.json`)

  for (const path of [metaPathV2, metaPathV1]) {
    try {
      const rawText = readFileSync(path, "utf-8")
      const parsed = JSON.parse(rawText)
      return WorkflowMetaSchema.parse(parsed)
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load workflow meta: ${wfId} in pack: ${packId}. Error: ${message}`)
    }
  }

  throw new Error(`Workflow meta not found: ${wfId} in pack: ${packId} (tried ${metaPathV2} and ${metaPathV1})`)
}

/**
 * @deprecated 使用 listIndustryWorkflows 替代。仅为兼容旧调用保留。
 */
export const loadIndustryWorkflows = listIndustryWorkflows

// ─── Workflow DAG ───────────────────────────────────────────────

/**
 * 装载指定 workflow 的 DAG 定义。
 *
 * 路径：industry-packs/<packId>/workflows/<wfId>/dag.json
 *
 * 找不到文件时返回 null，调用方决定是否报错——MVP 期允许部分 workflow 暂无 DAG。
 */
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

  const dagPath = join(PACKS_DIR, packId, "workflows", wfId, "dag.json")
  try {
    const rawText = readFileSync(dagPath, "utf-8")
    const parsed = JSON.parse(rawText)
    const verified = WorkflowDagFileSchema.parse(parsed)
    if (verified.id !== wfId) {
      throw new Error(`DAG id mismatch: file dag.json declares id="${verified.id}" but located under workflows/${wfId}/`)
    }
    workflowDagCache.set(cacheKey, verified)
    return verified
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load workflow DAG: ${wfId} in pack: ${packId}. Error: ${message}`)
  }
}

// ─── Workflow UI 步骤 ───────────────────────────────────────────

/**
 * 装载指定 workflow 的 UI 步骤定义。
 *
 * 路径：industry-packs/<packId>/workflows/<wfId>/steps.json
 *
 * 找不到文件时返回 null。
 */
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

  const stepsPath = join(PACKS_DIR, packId, "workflows", wfId, "steps.json")
  try {
    const rawText = readFileSync(stepsPath, "utf-8")
    const parsed = JSON.parse(rawText)
    const verified = WorkflowStepsFileSchema.parse(parsed)
    if (verified.id !== wfId) {
      throw new Error(`Steps id mismatch: file steps.json declares id="${verified.id}" but located under workflows/${wfId}/`)
    }
    workflowStepsCache.set(cacheKey, verified)
    return verified
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load workflow steps: ${wfId} in pack: ${packId}. Error: ${message}`)
  }
}

/**
 * 一次性装载 workflow 的全部内容（meta + dag + steps）。
 *
 * 用于 /api/industry/[packId]/workflows/[wfId] 端点。
 */
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
    const filePath = join(PACKS_DIR, packId, "agents", `${agentId}.json`)
    try {
      const rawText = readFileSync(filePath, "utf-8")
      const parsed = JSON.parse(rawText)
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

/**
 * 装载行业 prompt 模板（Markdown）。
 *
 * 路径：industry-packs/<packId>/prompts/<key>.md
 *
 * 落地 CLAUDE.md §3.2：行业 prompt 必须随包发布，不得硬编码进核心。
 *
 * 找不到文件时返回 null，调用方决定是否报错或降级到通用模板。
 */
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

// ─── 缓存清理 ───────────────────────────────────────────────────

export function clearCache(packId?: string): void {
  if (packId) {
    manifestCache.delete(packId)
    workflowMetasCache.delete(packId)
    agentsCache.delete(packId)
    // 工作流 DAG / steps / prompt 用 packId::xxx 复合 key，遍历清理
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
    promptCache.clear()
  }
}

/**
 * @deprecated 使用 clearCache 替代。仅为兼容旧调用保留。
 */
export const clearManifestCache = clearCache
