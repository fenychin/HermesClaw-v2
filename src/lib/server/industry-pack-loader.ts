import { IndustryManifestSchema } from "@/contracts"
import type { IndustryManifest } from "@/contracts"
import { readFileSync } from "fs"
import { join } from "path"

const PACKS_DIR = join(process.cwd(), "industry-packs")

/**
 * 遗留行业包配置格式映射器（纯函数）
 *
 * NOTE: 将遗留的旧版清单数据（如只包含 id 属性、只包含 directory 数组而无 directories 描述、缺失系统时间戳等）
 * 映射为符合最新标准的 IndustryManifest 数据，以便后续通过纯净的 Zod Schema 强校验，从而解耦契约定义。
 */
export function mapLegacyManifest(val: unknown): Record<string, unknown> | unknown {
  if (val && typeof val === "object") {
    const obj = val as Record<string, any>
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
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Industry pack manifest not found for packId: ${packId}`)
    }
    throw error
  }
  
  try {
    const raw = JSON.parse(rawText)
    const mapped = mapLegacyManifest(raw)
    return IndustryManifestSchema.parse(mapped)   // Zod 强校验
  } catch (error: any) {
    throw new Error(`Failed to parse industry pack manifest for packId: ${packId}: ${error.message}`)
  }
}

const manifestCache = new Map<string, IndustryManifest>()

export function getCachedManifest(packId: string): IndustryManifest {
  if (!manifestCache.has(packId)) {
    manifestCache.set(packId, loadIndustryManifest(packId))
  }
  return manifestCache.get(packId)!
}

export function clearManifestCache(packId?: string): void {
  if (packId) {
    manifestCache.delete(packId)
  } else {
    manifestCache.clear()
  }
}
