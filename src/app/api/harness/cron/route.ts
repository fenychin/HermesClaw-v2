/**
 * GET /api/harness/cron —— Harness 定时评估入口（模拟定时任务）
 *
 * 复用 /api/harness/evaluate 的核心评估逻辑，触发来源标记为 auto。
 * 后续可由 Vercel Cron 每 72 小时调用一次（vercel.json 中配置 schedule）。
 *
 * 可选保护：配置 CRON_SECRET 后，须携带 `Authorization: Bearer <CRON_SECRET>`。
 * 响应额外包含 nextEvaluatedAt（下次评估时间 = 现在 + 72 小时）。
 */
import { NextRequest } from "next/server"
import { logger } from '@/lib/logger';
import { prisma } from "@/lib/prisma"
import { runHarnessEvaluation, EVAL_WINDOW_HOURS } from "@/lib/server/harness-eval"
import { successResponse, errorResponse } from "@/lib/api-utils"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  // 配置了 CRON_SECRET 时校验调用方身份（Vercel Cron 会带此 header）
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return errorResponse("未授权的定时任务调用", 401)
    }
  }

  try {
    // 1. 查询数据库中所有的 Workspace
    const workspaces = await prisma.workspace.findMany({
      select: { id: true },
    })

    // 2. 提取需要评估的目标工作空间列表
    let targetWorkspaces = workspaces.map((w) => w.id)

    // 3. 兜底逻辑：若数据库无工作空间，回退至环境变量 DEFAULT_WORKSPACE_ID
    if (targetWorkspaces.length === 0) {
      const defaultWs = process.env.DEFAULT_WORKSPACE_ID
      if (defaultWs) {
        targetWorkspaces = [defaultWs]
      }
    }

    if (targetWorkspaces.length === 0) {
      return errorResponse("评估中止：未发现任何有效工作空间且 DEFAULT_WORKSPACE_ID 未配置", 500)
    }

    // 4. 串行依次执行每个工作空间的演化评估，防止大模型 API 并发限流
    const results = []
    for (const wsId of targetWorkspaces) {
      try {
        const evalResult = await runHarnessEvaluation(wsId, "auto")
        results.push({
          workspaceId: wsId,
          success: true,
          triggered: evalResult.triggered,
          proposalId: evalResult.proposal?.proposalId ?? null,
        })
      } catch (err) {
        logger.error(`[cron] 评估工作空间 ${wsId} 失败`, {
          error: err instanceof Error ? err.message : "未知错误",
        })
        results.push({
          workspaceId: wsId,
          success: false,
          error: err instanceof Error ? err.message : "未知错误",
        })
      }
    }

    const nextEvaluatedAt = new Date(
      Date.now() + EVAL_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString()

    return successResponse({
      evaluatedAt: new Date().toISOString(),
      nextEvaluatedAt,
      intervalHours: EVAL_WINDOW_HOURS,
      workspacesCount: targetWorkspaces.length,
      results,
    })
  } catch (error) {
    logger.error('GET /api/harness/cron: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    const message = error instanceof Error ? error.message : "未知错误"
    return errorResponse(`Harness 定时评估失败：${message}`, 502)
  }
}
