/**
 * POST /api/harness/evaluate —— 手动触发一次 Harness 自评估（Level 2）
 *
 * 流程：读取最近 72h 智能体运行日志 → 统计失败率/成功率等指标
 *       → 达触发条件时调用 AI 分析 → 自动创建 HarnessProposal。
 *
 * 请求体（可选）：{ triggeredBy?: "auto" | "manual" }，默认 manual。
 * 响应：successResponse(HarnessEvaluateResult)
 */
import { runHarnessEvaluation } from "@/lib/server/harness-eval"
import { logger } from '@/lib/logger';
import { successResponse, errorResponse } from "@/lib/api-utils"
import { rateLimit } from "@/lib/rate-limit"
import { HarnessEvaluateSchema, validateBody } from "@/lib/validators"

export const runtime = "nodejs"
// AI 分析可能耗时，放宽函数超时（Vercel 部署时生效）
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    // 频率限制：每分钟最多 5 次
    const ip = request.headers.get("x-forwarded-for") || "unknown"
    if (!rateLimit(ip, 5, 60_000)) {
      return Response.json(
        { success: false, error: "评估请求过于频繁，请稍后重试" },
        { status: 429 },
      )
    }

    // 解析可选 body 中的 triggeredBy（手动触发默认 manual）
    let triggeredBy: "auto" | "manual" = "manual"
    try {
      const rawBody = await request.json()
      const parsed = validateBody(rawBody, HarnessEvaluateSchema)
      if (parsed instanceof Response) return parsed
      triggeredBy = parsed.triggeredBy
    } catch {
      // 无 body 时忽略，使用默认值
    }

    const result = await runHarnessEvaluation(triggeredBy)
    return successResponse(result)
  } catch (error) {
    logger.error('POST /api/harness/evaluate: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    const message = error instanceof Error ? error.message : "未知错误"
    // 502：上游 AI 分析失败（如缺少 API Key）；区别于纯内部错误
    return errorResponse(`Harness 评估失败：${message}`, 502)
  }
}
