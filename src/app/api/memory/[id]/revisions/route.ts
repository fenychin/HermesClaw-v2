/**
 * GET /api/memory/[id]/revisions —— 记忆修订历史（KCL，AGENTS.md 4.2）
 *
 * 返回某条记忆的全部历史版本快照（按 version 倒序）。
 */
import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"

export const runtime = "nodejs"

function serialize(rev: { createdAt: Date } & Record<string, unknown>) {
  return { ...rev, createdAt: rev.createdAt.toISOString() }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const memory = await prisma.memory.findUnique({ where: { id } })
    if (!memory) {
      return errorResponse("记忆不存在", 404)
    }

    const revisions = await prisma.memoryRevision.findMany({
      where: { memoryId: id },
      orderBy: { version: "desc" },
    })

    return successResponse({
      currentVersion: memory.version,
      revisions: revisions.map(serialize),
    })
  } catch (error) {
    logger.error('GET /api/memory/[id]/revisions: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}
