import { ApiResponse } from "@/lib/server/api-response"
import { withRBAC } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { logger } from "@/lib/logger"
import fs from "fs"
import path from "path"

// ─── 类型 ────────────────────────────────────────────
interface AvailablePackSummary {
  packId: string
  packName: string
  version: string
  description: string
  targetIndustry: string
  compatibleHermesApi: string
  compatibleRuntimeApi: string
  capabilityCount: number
  agentCount: number
}

// ─── 路径解析 ─────────────────────────────────────────
function resolvePacksDir(): string {
  const cwd = process.cwd()
  const candidates = [
    path.join(cwd, "industry-packs"),
    path.resolve(cwd, "..", "industry-packs"),
    path.resolve(cwd, "..", "..", "industry-packs"),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      logger.info(`[available-packs] packsDir 命中: ${candidate} (cwd=${cwd})`)
      return candidate
    }
  }
  logger.warn(`[available-packs] 所有候选路径均不存在，cwd=${cwd}，候选=${candidates.join(', ')}`)
  return candidates[candidates.length - 1]
}

// ─── manifest 读取 ────────────────────────────────────
function readPackManifest(packsDir: string, packId: string): Record<string, unknown> | null {
  const exts = [".yaml", ".yml", ".json"]
  for (const ext of exts) {
    const filePath = path.join(packsDir, packId, `manifest${ext}`)
    if (!fs.existsSync(filePath)) continue

    try {
      const raw = fs.readFileSync(filePath, "utf-8")
      if (ext === ".json") return JSON.parse(raw)

      // 动态 require yaml 以避免顶层 import 在极端环境下的解析问题
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const yaml = require("yaml")
      return yaml.parse(raw) as Record<string, unknown>
    } catch (err) {
      logger.warn(`[available-packs] 解析 manifest 失败 ${filePath}: ${(err as Error).message}`)
      return null
    }
  }
  logger.warn(`[available-packs] ${packId}: 未找到 manifest 文件 (已尝试 ${exts.join(', ')})`)
  return null
}

// ─── 字段提取 ─────────────────────────────────────────
function getApiVersionField(field: unknown): string {
  if (typeof field === "object" && field !== null) {
    const obj = field as Record<string, unknown>
    return String(obj.min || obj.version || "1.0.0")
  }
  return String(field || "1.0.0")
}

// ─── GET /api/industry-packs/available ─────────────────
export const GET = withRBAC(async (_request: Request, _ctx: WorkspaceContext) => {
  const available: AvailablePackSummary[] = []
  let packsDir = ""

  try {
    packsDir = resolvePacksDir()

    if (!fs.existsSync(packsDir)) {
      logger.warn(`[available-packs] packsDir 不存在: ${packsDir}`)
      return ApiResponse.ok({
        available: [],
        source: "filesystem",
        diagnostic: `packsDir not found: ${packsDir}`,
      })
    }

    const entries = fs.readdirSync(packsDir, { withFileTypes: true })
    logger.info(`[available-packs] 扫描目录 ${packsDir}，发现 ${entries.filter(e => e.isDirectory()).length} 个子目录`)

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const packId = entry.name
      if (packId.startsWith(".") || packId === "node_modules") continue

      const manifest = readPackManifest(packsDir, packId)
      if (!manifest) continue

      const dir = (manifest.directory || {}) as Record<string, unknown>
      const skills = Array.isArray(dir.skills) ? dir.skills.length : 0
      const workflows = Array.isArray(dir.workflows) ? dir.workflows.length : 0
      const connectors = Array.isArray(dir.connectors) ? dir.connectors.length : 0
      const agents = Array.isArray(dir.agents) ? dir.agents.length : 0

      available.push({
        packId: String(manifest.packId || manifest.id || packId),
        packName: String(manifest.name || packId),
        version: String(manifest.version || "0.0.0"),
        description: String(manifest.description || ""),
        targetIndustry: String(manifest.industry || "general"),
        compatibleHermesApi: getApiVersionField(manifest.compatibleHermesApi),
        compatibleRuntimeApi: getApiVersionField(manifest.compatibleRuntimeApi),
        capabilityCount: skills + workflows + connectors,
        agentCount: agents,
      })
    }

    logger.info(`[available-packs] 成功返回 ${available.length} 个可用包: ${available.map(p => p.packId).join(', ')}`)
    return ApiResponse.ok({ available, source: "filesystem" })
  } catch (error) {
    logger.error(`[available-packs] 未预期错误: ${(error as Error).message}`)
    return ApiResponse.error(
      `无法扫描行业包目录 (packsDir=${packsDir}): ${(error as Error).message}`,
      500
    )
  }
}, "VIEWER")
