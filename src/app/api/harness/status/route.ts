/**
 * GET /api/harness/status —— Harness 演化引擎实时状态
 *
 * 返回：
 *  - lastEvaluatedAt：最近一次评估时间（取最新提案 createdAt）
 *  - nextEvaluatedAt：lastEvaluatedAt + 72 小时
 *  - pendingCount：待审批提案数
 *  - totalProposals：历史提案总数
 *  - intervalHours：评估周期（72）
 */
import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"
import { EVAL_WINDOW_HOURS } from "@/lib/server/harness-eval"
import type { HarnessStatus } from "@/types"
import { buildWorkspaceContext } from "@/lib/workspace"

export const runtime = "nodejs"

/** 路由段缓存：5 分钟内复用评估状态（Harness 评估周期为 72 小时，状态不常变） */
export const revalidate = 300

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const [latest, pendingCount, totalProposals] = await Promise.all([
      prisma.harnessProposal.findFirst({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.harnessProposal.count({ where: { status: "pending", workspaceId: ctx.workspaceId } }),
      prisma.harnessProposal.count({ where: { workspaceId: ctx.workspaceId } }),
    ])

    const lastEvaluatedAt = latest?.createdAt.toISOString() ?? null
    const nextEvaluatedAt = latest
      ? new Date(
          latest.createdAt.getTime() + EVAL_WINDOW_HOURS * 60 * 60 * 1000,
        ).toISOString()
      : null

    const status: HarnessStatus = {
      lastEvaluatedAt,
      nextEvaluatedAt,
      pendingCount,
      totalProposals,
      intervalHours: EVAL_WINDOW_HOURS,
    }

    return successResponse(status)
  } catch (error) {
    logger.error('GET /api/harness/status: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}
