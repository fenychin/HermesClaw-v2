import { generateHermesSuggestions } from "@/lib/server/hermes-suggestions"
import { logger } from '@/lib/logger'; import { writeAgentLog } from "@/lib/server/agent-log"
import { successResponse, errorResponse } from "@/lib/api-utils"
export const runtime = "nodejs"

export async function GET() {
  const start = Date.now(); const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`
  try {
    const result = await generateHermesSuggestions()
    void writeAgentLog({ source: "hermes-suggestions", taskName: "今日建议生成", status: "success", duration: elapsed(), detail: `${result.provider}/${result.model} · ${result.suggestions.length} 条` })
    return successResponse(result)
  } catch (error) { logger.error('GET /api/hermes/suggestions: 失败'); void writeAgentLog({ source: "hermes-suggestions", taskName: "今日建议生成", status: "error", duration: elapsed(), detail: error instanceof Error ? error.message : "失败" }); return errorResponse(error instanceof Error ? error.message : "今日建议生成失败") }
}
