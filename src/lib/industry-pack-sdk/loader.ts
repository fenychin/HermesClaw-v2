import { readFileSync, existsSync, readdirSync } from "fs"
import { join } from "path"
import yaml from "yaml"
import { IndustryManifestSchema } from "@/contracts"
import type { IndustryManifest } from "@/contracts"
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

const PACKS_DIR = join(process.cwd(), "industry-packs")

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
  const exts = [".yaml", ".yml", ".json"];
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
  
  try {
    const basePath = join(PACKS_DIR, packId, "manifest")
    const { parsed } = readAssetFile(basePath)
    const mapped = mapLegacyManifest(parsed)
    const manifest = IndustryManifestSchema.parse(mapped)

    // 异步记录审计日志（不阻塞加载流程，防止 Next.js 客户端打包引入后端模块报错）
    import("@/lib/server/audit")
      .then(({ writeAuditLog }) => {
        writeAuditLog({
          actor: "system",
          action: "industry.pack.activate",
          targetType: "industry",
          targetId: packId,
          detail: `成功加载并激活行业包: ${manifest.name} (v${manifest.version})`,
          riskLevel: "medium",
          workspaceId: "default"
        }).catch(() => {});
      })
      .catch(() => {});

    return manifest
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("File not found")) {
      throw new Error(`Industry pack manifest not found for packId: ${packId}`)
    }
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
      const verified = PackSkillAssetSchema.parse(parsed)
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
