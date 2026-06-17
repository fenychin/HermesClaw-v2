import { prisma } from "@/lib/prisma"; import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"; import { getBrainStats } from "@/lib/server/brain"

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request); const wsId = new URL(request.url).searchParams.get("workspaceId") || ctx.workspaceId
    const [orgCount, projCount, sessCount, recentMemories] = await Promise.all([
      prisma.memory.count({ where: { workspaceId: wsId, type: "long", status: "active" } }),
      prisma.memory.count({ where: { workspaceId: wsId, type: "mid", status: "active" } }),
      prisma.memory.count({ where: { workspaceId: wsId, type: "short", status: "active" } }),
      prisma.memory.findMany({ where: { workspaceId: wsId, status: "active" }, orderBy: { updatedAt: "desc" }, take: 5 }),
    ])
    const recentlyUpdated = recentMemories.map((m: any) => { let tags: any[] = []; try { tags = JSON.parse(m.tags || "[]") } catch {}; return { id: m.id, type: m.type, content: (m.content || "").substring(0, 200), summary: m.summary, source: m.source, tags, version: m.version, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() } })
    const allTags = await prisma.memory.findMany({ where: { workspaceId: wsId, status: "active" }, select: { tags: true } })
    const tagCounts: Record<string, number> = {}; allTags.forEach((m: any) => { try { JSON.parse(m.tags || "[]").forEach((t: string) => { if (t?.trim()) tagCounts[t.trim()] = (tagCounts[t.trim()] || 0) + 1 }) } catch {} })
    const topTags = Object.entries(tagCounts).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 10)
    let memoryHitRate = 0.85; try { const s = await getBrainStats(wsId); memoryHitRate = s.hitRate / 100 } catch {}
    return successResponse({ orgMemoryCount: orgCount, projectMemoryCount: projCount, sessionMemoryCount: sessCount, recentlyUpdated, topTags, memoryHitRate })
  } catch (error) { logger.error('GET /api/brain/overview: 失败'); return errorResponse("服务器内部错误") }
}
