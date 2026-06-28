import { ApiResponse } from "@/lib/server/api-response"
import { withRBAC } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import fs from "fs"
import path from "path"
import yaml from "yaml"

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

/**
 * 解析 industry-packs/ 目录的绝对路径。
 * 在 monorepo 中 process.cwd() 可能是 apps/web/，需要向上探测。
 */
function resolvePacksDir(): string {
  const candidates = [
    path.join(process.cwd(), "industry-packs"),
    path.resolve(process.cwd(), "..", "industry-packs"),
    path.resolve(process.cwd(), "..", "..", "industry-packs"),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  // 若都不存在，返回最可能的路径（后续 existsSync 会拦截）
  return candidates[candidates.length - 1]
}

/**
 * 读取并解析单个 manifest 文件。
 * 支持 .yaml / .yml / .json 三种格式。
 * 不依赖 SDK 的 loadIndustryManifest()，因为 SDK 内部 PACKS_DIR 是模块加载时常量，
 * 在 Next.js monorepo 中可能因 cwd 不同而解析到错误路径。
 */
function readPackManifest(packsDir: string, packId: string): any | null {
  const exts = [".yaml", ".yml", ".json"]
  for (const ext of exts) {
    const filePath = path.join(packsDir, packId, `manifest${ext}`)
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, "utf-8")
        if (ext === ".json") {
          return JSON.parse(raw)
        }
        return yaml.parse(raw)
      } catch (err) {
        console.warn(`[available-packs] 解析 manifest 失败 ${filePath}:`, (err as Error).message)
        return null
      }
    }
  }
  return null
}

/**
 * 从 manifest 中安全提取 API 版本字段。
 * compatibleHermesApi / compatibleRuntimeApi 可能是 { min, max } 对象，也可能直接是字符串。
 */
function getApiVersionField(field: any): string {
  if (typeof field === "object" && field !== null) {
    return field.min || field.version || "1.0.0"
  }
  return String(field || "1.0.0")
}

/**
 * GET /api/industry-packs/available
 *
 * 扫描文件系统中 `industry-packs/` 目录，返回所有可用行业包的摘要信息。
 * 与已安装列表（查询 DB）不同：此端点展示所有可安装的 pack，不论是否已安装。
 *
 * 设计要点：
 * - 直接读盘解析 YAML/JSON，不依赖 SDK 内部 PACKS_DIR（避免 monorepo cwd 漂移）
 * - 容忍单个 pack 解析失败，不影响其他 pack 的返回
 */
export const GET = withRBAC(async (_request: Request, _ctx: WorkspaceContext) => {
  try {
    const packsDir = resolvePacksDir()

    // 目录不存在 → 返回空列表（前端展示引导性空状态）
    if (!fs.existsSync(packsDir)) {
      console.warn(`[available-packs] packsDir 不存在: ${packsDir}`)
      return ApiResponse.ok({ available: [] })
    }

    const entries = fs.readdirSync(packsDir, { withFileTypes: true })
    const available: AvailablePackSummary[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const packId = entry.name

      // 跳过隐藏目录与非 pack 目录
      if (packId.startsWith(".") || packId === "node_modules") continue

      try {
        const manifest = readPackManifest(packsDir, packId)
        if (!manifest) {
          console.warn(`[available-packs] 跳过 ${packId}: 未找到 manifest 文件`)
          continue
        }

        // 统计能力数量：从 directory 声明中读取
        const dir = manifest.directory || {}
        const capabilityCount =
          (dir.skills?.length || 0) +
          (dir.workflows?.length || 0) +
          (dir.connectors?.length || 0)
        const agentCount = dir.agents?.length || 0

        available.push({
          packId: manifest.packId || manifest.id || packId,
          packName: manifest.name || packId,
          version: manifest.version || "0.0.0",
          description: manifest.description || "",
          targetIndustry: manifest.industry || "general",
          compatibleHermesApi: getApiVersionField(manifest.compatibleHermesApi),
          compatibleRuntimeApi: getApiVersionField(manifest.compatibleRuntimeApi),
          capabilityCount,
          agentCount,
        })
      } catch (err) {
        console.warn(`[available-packs] 跳过目录 ${packId}:`, (err as Error).message)
      }
    }

    return ApiResponse.ok({ available })
  } catch (error) {
    console.error("[available-packs] 未预期错误:", error)
    return ApiResponse.error(
      error instanceof Error ? error.message : "无法获取可用行业包列表",
      500
    )
  }
}, "VIEWER")
