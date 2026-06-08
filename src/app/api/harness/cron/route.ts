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
    const result = await runHarnessEvaluation("auto")
    const nextEvaluatedAt = new Date(
      Date.now() + EVAL_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString()

    return successResponse({
      ...result,
      evaluatedAt: new Date().toISOString(),
      nextEvaluatedAt,
      intervalHours: EVAL_WINDOW_HOURS,
    })
  } catch (error) {
    logger.error('GET /api/harness/cron: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    const message = error instanceof Error ? error.message : "未知错误"
    return errorResponse(`Harness 定时评估失败：${message}`, 502)
  }
}
