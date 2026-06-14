import { IndustryManifestSchema } from "@/contracts"
import type { IndustryManifest } from "@/contracts"
import { readFileSync } from "fs"
import { join } from "path"
import { z } from "zod"

const PACKS_DIR = join(process.cwd(), "industry-packs")

// 缓存容器
const workflowsCache = new Map<string, PackWorkflowAsset[]>()
const agentsCache = new Map<string, PackAgentAsset[]>()
const manifestCache = new Map<string, IndustryManifest>()

// 引入外置资产的 Zod 轻量校验契约
export const PackWorkflowAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  icon: z.string().optional(),
})

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
  stats: z.record(z.unknown()).optional(),
  lastActive: z.string().optional(),
  createdAt: z.string().optional(),
  industryId: z.string().optional(),
  templateId: z.string().optional(),
})

export type PackWorkflowAsset = z.infer<typeof PackWorkflowAssetSchema>
export type PackAgentAsset = z.infer<typeof PackAgentAssetSchema>

interface LegacyManifest {
  packId?: string
  id?: string
  directories?: {
    agents?: boolean
    workflows?: boolean
    skills?: boolean
    connectors?: boolean
    knowledge?: boolean
    schemas?: boolean
    dashboards?: boolean
    evalRules?: boolean
  }
  directory?: {
    agents?: string[]
    workflows?: string[]
    skills?: string[]
    connectors?: string[]
  }
  industry?: string
  createdAt?: string
  updatedAt?: string
  version_field?: string
  version?: string
  [key: string]: unknown
}

/**
 * 遗留行业包配置格式映射器（纯函数）
 *
 * NOTE: 将遗留的旧版清单 data（如只包含 id 属性、只包含 directory 数组而无 directories 描述、缺失系统时间戳等）
 * 映射为符合最新标准的 IndustryManifest 数据，以便后续通过纯净的 Zod Schema 强校验，从而解耦契约定义。
 */
export function mapLegacyManifest(val: unknown): Record<string, unknown> | unknown {
  if (val && typeof val === "object") {
    const obj = val as LegacyManifest
    const packId = obj.packId || obj.id
    const id = obj.id || obj.packId

    let directories = obj.directories
    if (obj.directory && !directories) {
      directories = {
        agents: Array.isArray(obj.directory.agents) && obj.directory.agents.length > 0,
        workflows: Array.isArray(obj.directory.workflows) && obj.directory.workflows.length > 0,
        skills: Array.isArray(obj.directory.skills) && obj.directory.skills.length > 0,
        connectors: Array.isArray(obj.directory.connectors) && obj.directory.connectors.length > 0,
        knowledge: false,
        schemas: false,
        dashboards: false,
        evalRules: false,
      }
    }

    const industry = obj.industry || packId
    const createdAt = obj.createdAt || new Date().toISOString()
    const updatedAt = obj.updatedAt || new Date().toISOString()
    const version_field = obj.version_field || obj.version || "1.0.0"

    return {
      ...obj,
      packId,
      id,
      industry,
      directories,
      createdAt,
      updatedAt,
      version_field,
    }
  }
  return val
}

export function loadIndustryManifest(packId: string): IndustryManifest {
  if (!/^[a-zA-Z0-9_-]+$/.test(packId)) {
    throw new Error(`Invalid packId format: ${packId}. Only alphanumeric characters, dashes and underscores are allowed.`)
  }

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
    return IndustryManifestSchema.parse(mapped)   // Zod 强校验
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

export function clearManifestCache(packId?: string): void {
  if (packId) {
    manifestCache.delete(packId)
    workflowsCache.delete(packId)
    agentsCache.delete(packId)
  } else {
    manifestCache.clear()
    workflowsCache.clear()
    agentsCache.clear()
  }
}

/**
 * 扫描指定行业包 workflows 文件夹下的全部 JSON 工作流元数据（带缓存与 Zod 强校验）
 */
export function loadIndustryWorkflows(packId: string): PackWorkflowAsset[] {
  if (workflowsCache.has(packId)) {
    return workflowsCache.get(packId)!
  }

  const manifest = getCachedManifest(packId)
  const wfIds = manifest.directory?.workflows || []
  const workflows: PackWorkflowAsset[] = []

  for (const wfId of wfIds) {
    const filePath = join(PACKS_DIR, packId, "workflows", `${wfId}.json`)
    try {
      const rawText = readFileSync(filePath, "utf-8")
      const parsed = JSON.parse(rawText)
      const verified = PackWorkflowAssetSchema.parse(parsed)
      workflows.push(verified)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load workflow asset: ${wfId} in pack: ${packId}. Error: ${message}`)
    }
  }

  workflowsCache.set(packId, workflows)
  return workflows
}

/**
 * 扫描指定行业包 agents 文件夹下的全部 JSON 岗位元数据（带缓存与 Zod 强校验）
 */
export function loadIndustryAgents(packId: string): PackAgentAsset[] {
  if (agentsCache.has(packId)) {
    return agentsCache.get(packId)!
  }

  const manifest = getCachedManifest(packId)
  const agentIds = manifest.directory?.agents || []
  const agents: PackAgentAsset[] = []

  for (const agentId of agentIds) {
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
