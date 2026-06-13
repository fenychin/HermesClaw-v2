import { IndustryManifestSchema } from "@/contracts"
import type { IndustryManifest } from "@/contracts"
import { readFileSync } from "fs"
import { join } from "path"

const PACKS_DIR = join(process.cwd(), "industry-packs")

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
    return IndustryManifestSchema.parse(raw)   // Zod 强校验
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
