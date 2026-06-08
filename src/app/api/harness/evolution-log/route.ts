/**
 * GET /api/harness/evolution-log —— Harness 进化历史（AGENTS.md 4.6 历史存档）
 *
 * 返回最近的评估记录（触发与未触发均含），供智慧大脑展示演化趋势与报告。
 * 可选 ?limit=（默认 50，上限 200）。
 */
import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"

export const runtime = "nodejs"

/** 序列化 EvolutionLog，将 DateTime 转 ISO */
function serialize(log: { evaluatedAt: Date; createdAt: Date } & Record<string, unknown>) {
  return {
    ...log,
    evaluatedAt: log.evaluatedAt.toISOString(),
    createdAt: log.createdAt.toISOString(),
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limitParam = Number(searchParams.get("limit"))
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 200)
        : 50

    const logs = await prisma.evolutionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    return successResponse({ logs: logs.map(serialize) })
  } catch (error) {
    logger.error('GET /api/harness/evolution-log: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}
