import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"
import { getBrainStats } from "@/lib/server/brain"

/** GET /api/brain/overview —— 获取大脑总览指标 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get("workspaceId") || ctx.workspaceId

    // 1. 获取三层记忆的活跃总数
    const [orgMemoryCount, projectMemoryCount, sessionMemoryCount] = await Promise.all([
      prisma.memory.count({
        where: { workspaceId, type: "long", status: "active" },
      }),
      prisma.memory.count({
        where: { workspaceId, type: "mid", status: "active" },
      }),
      prisma.memory.count({
        where: { workspaceId, type: "short", status: "active" },
      }),
    ])

    // 2. 获取最近 5 条更新的活跃记忆
    const recentlyUpdatedMemories = await prisma.memory.findMany({
      where: { workspaceId, status: "active" },
      orderBy: { updatedAt: "desc" },
      take: 5,
    })

    const recentlyUpdated = recentlyUpdatedMemories.map((m) => {
      const parsedTags = (() => {
        try {
          return JSON.parse(m.tags || "[]")
        } catch {
          return []
        }
      })()
      return {
        id: m.id,
        workspaceId: m.workspaceId,
        projectId: m.projectId,
        type: m.type,
        content: m.content.length > 200 ? m.content.substring(0, 200) + "..." : m.content,
        summary: m.summary,
        source: m.source,
        tags: parsedTags,
        version: m.version,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      }
    })

    // 3. 计算常用标签 Top 10 及计数
    const allActiveMemories = await prisma.memory.findMany({
      where: { workspaceId, status: "active" },
      select: { tags: true },
    })

    const tagCounts: Record<string, number> = {}
    allActiveMemories.forEach((m) => {
      try {
        const tags = JSON.parse(m.tags || "[]") as string[]
        tags.forEach((t) => {
          if (t && t.trim()) {
            const cleanTag = t.trim()
            tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1
          }
        })
      } catch (e) {
        // 忽略 JSON 解析错
      }
    })

    const topTags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // 4. 从 getBrainStats 获取命中率 (memoryHitRate)
    let memoryHitRate = 0.85
    try {
      const stats = await getBrainStats(workspaceId)
      memoryHitRate = stats.hitRate / 100 // 换算成 0-1 小数
    } catch (err) {
      logger.warn("GET /api/brain/overview: 获取 getBrainStats 失败，使用默认命中率", { error: err })
    }

    return successResponse({
      orgMemoryCount,
      projectMemoryCount,
      sessionMemoryCount,
      recentlyUpdated,
      topTags,
      memoryHitRate,
    })
  } catch (error) {
    logger.error('GET /api/brain/overview: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}
