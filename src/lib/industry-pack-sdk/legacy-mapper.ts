/**
 * Industry Pack SDK — 旧 manifest 格式映射器
 *
 * 历史 manifest.json 用 `directory: { agents: [], workflows: [] }`（数组形式），
 * 新 schema（src/contracts/industry-manifest.ts）改为 `directories: { agents: bool }` + `directory: { ... }`。
 * 本文件是兼容层，确保旧 pack 文件可被现 IndustryManifestSchema 接受。
 *
 * 来源：原 src/lib/server/industry-pack-loader.ts:mapLegacyManifest，迁移至 SDK。
 */

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
    prompts?: boolean
  }
  directory?: {
    agents?: string[]
    workflows?: string[]
    skills?: string[]
    connectors?: string[]
    prompts?: string[]
    knowledge?: string[]
    schemas?: string[]
    dashboards?: string[]
    evalRules?: string[]
  }
  industry?: string
  createdAt?: string
  updatedAt?: string
  version_field?: string
  version?: string
  [key: string]: unknown
}

/**
 * 把旧版（或本仓库当前的简化版）manifest data 映射为符合
 * IndustryManifestSchema 的对象，供后续 zod 强校验。
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
        knowledge: Array.isArray(obj.directory.knowledge) && obj.directory.knowledge.length > 0,
        schemas: Array.isArray(obj.directory.schemas) && obj.directory.schemas.length > 0,
        dashboards: Array.isArray(obj.directory.dashboards) && obj.directory.dashboards.length > 0,
        evalRules: Array.isArray(obj.directory.evalRules) && obj.directory.evalRules.length > 0,
        prompts: Array.isArray(obj.directory.prompts) && obj.directory.prompts.length > 0,
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
