import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"

/** GET /api/memory/[id]/revisions —— 获取单条记忆的版本历史 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const ctx = await buildWorkspaceContext(request)

    const existing = await prisma.memory.findUnique({
      where: { id }
    })

    if (!existing) {
      return errorResponse("记忆不存在", 404)
    }

    if (existing.workspaceId !== ctx.workspaceId) {
      return errorResponse("无权访问此记忆的版本历史", 403)
    }

    const revisions = await prisma.memoryRevision.findMany({
      where: { memoryId: id },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        content: true,
        summary: true,
        editedBy: true,
        reason: true,
        createdAt: true,
      }
    })

    return successResponse({ revisions })
  } catch (error) {
    logger.error('GET /api/memory/[id]/revisions: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}
