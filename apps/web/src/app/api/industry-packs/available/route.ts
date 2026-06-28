import { ApiResponse } from "@/lib/server/api-response"
import { withRBAC } from "@/lib/server/api-handler"
import { loadIndustryManifest, getCachedManifest } from "@hermesclaw/industry-pack-sdk"
import type { WorkspaceContext } from "@/lib/workspace"
import fs from "fs"
import path from "path"

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

function resolvePacksDir(): string {
  const candidates = [
    path.join(process.cwd(), "industry-packs"),
    path.resolve(process.cwd(), "..", "industry-packs"),
    path.resolve(process.cwd(), "..", "..", "industry-packs"),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return candidates[candidates.length - 1]
}

function getApiVersionField(field: any): string {
  if (typeof field === "object" && field !== null) {
    return field.min || field.version || "1.0.0"
  }
  return String(field || "1.0.0")
}

/**
 * GET /api/industry-packs/available
 * 扫描文件系统中 `industry-packs/` 目录，返回所有可用行业包的摘要信息。
 * 与已安装列表不同：此端点展示所有可安装的 pack，不论是否已安装。
 */
export const GET = withRBAC(async (_request: Request, _ctx: WorkspaceContext) => {
  try {
    const packsDir = resolvePacksDir()

    if (!fs.existsSync(packsDir)) {
      return ApiResponse.ok({ available: [] })
    }

    const entries = fs.readdirSync(packsDir, { withFileTypes: true })
    const available: AvailablePackSummary[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const packId = entry.name

      // 跳过非 pack 目录（如 node_modules、.git 等）
      if (packId.startsWith(".") || packId === "node_modules") continue

      try {
        const manifest = loadIndustryManifest(packId)

        const capabilities = (manifest.directory?.skills?.length || 0) +
          (manifest.directory?.workflows?.length || 0) +
          (manifest.directory?.connectors?.length || 0)

        available.push({
          packId: manifest.packId || packId,
          packName: manifest.name || packId,
          version: manifest.version || "0.0.0",
          description: manifest.description || "",
          targetIndustry: manifest.industry || "general",
          compatibleHermesApi: getApiVersionField(manifest.compatibleHermesApi),
          compatibleRuntimeApi: getApiVersionField(manifest.compatibleRuntimeApi),
          capabilityCount: capabilities,
          agentCount: manifest.directory?.agents?.length || 0,
        })
      } catch (err) {
        // 跳过无法加载 manifest 的目录
        console.warn(`[available-packs] 跳过目录 ${packId}:`, (err as Error).message)
      }
    }

    return ApiResponse.ok({ available })
  } catch (error) {
    return ApiResponse.error(
      error instanceof Error ? error.message : "无法获取可用行业包列表",
      500
    )
  }
}, "VIEWER")
