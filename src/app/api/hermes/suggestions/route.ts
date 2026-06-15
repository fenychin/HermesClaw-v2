/**
 * GET /api/hermes/suggestions —— Hermes 今日主动建议
 *
 * 用户打开 /new 新话题页时调用：Hermes 主动读取系统实时状态（待审批提案 /
 * 24h 错误率 / 风险项目），调用 Claude（Opus 4.8，无 key 回退 DeepSeek）生成
 * 3 条结构化今日工作建议。体现 AGENTS.md「AI 是第一工程主体」。
 *
 * 响应：{ success, data: { suggestions, snapshot, provider, model } }
 */
import { generateHermesSuggestions } from "@/lib/server/hermes/hermes-suggestions"
import { logger } from '@/lib/logger';
import { writeAgentLog } from "@/lib/server/shared/agent-log"
import { successResponse, errorResponse } from "@/lib/api-utils"

export const runtime = "nodejs"

export async function GET() {
  // 记录执行起点，供运行日志统计耗时（AGENTS.md 闭环反馈：任何执行须留痕）
  const start = Date.now()
  const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`

  try {
    const result = await generateHermesSuggestions()

    void writeAgentLog({
      source: "hermes-suggestions",
      taskName: "今日建议生成",
      status: "success",
      duration: elapsed(),
      detail: `${result.provider}/${result.model} · ${result.suggestions.length} 条`,
    })

    return successResponse(result)
  } catch (error) {
    logger.error('GET /api/hermes/suggestions: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    void writeAgentLog({
      source: "hermes-suggestions",
      taskName: "今日建议生成",
      status: "error",
      duration: elapsed(),
      detail: error instanceof Error ? error.message : "建议生成失败",
    })
    return errorResponse(
      error instanceof Error ? error.message : "今日建议生成失败",
    )
  }
}
