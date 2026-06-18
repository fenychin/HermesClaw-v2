/**
 * POST /api/harness/generate-spec —— AI 生成 Harness Spec
 *
 * v3.20：替换占位实现，接入真实 LLM 路由 + DB 上下文检索（TD-2026-06-17-001 解决）。
 */
import { logger } from "@/lib/logger"
import { ApiResponse } from "@/lib/server/api-response"
import { rateLimit } from "@/lib/rate-limit"
import { validateBody } from "@/lib/server/validators"
import { withRBAC } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { HarnessSpecGenerateSchema } from "@hermesclaw/event-contracts"
import { generateHarnessSpec } from "@/lib/server/harness/harness-spec-generator"
import { prisma } from "@/lib/prisma"
import { callLlmText } from "@/lib/server/llm-provider"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * 适配层：将 callLlmText (apps/web 侧) 映射为 generator 期望的
 * (systemPrompt, userPrompt) → string 签名（同 /api/harness/evaluate）。
 */
function makeCallLlmAdapter() {
  return async (systemPrompt: string, userPrompt: string): Promise<string> => {
    return callLlmText({
      provider: "deepseek",
      model: "deepseek-chat",
      systemPrompt,
      userPrompt,
    })
  }
}

export const POST = withRBAC(async (req: Request, ctx: WorkspaceContext) => {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  if (!rateLimit(ip, 5, 60_000)) {
    return ApiResponse.error("请求过于频繁，请稍后重试", 429)
  }
  try {
    const raw = await req.json()
    const parsed = validateBody(raw, HarnessSpecGenerateSchema)
    if (parsed instanceof Response) return parsed

    const result = await generateHarnessSpec(
      { ...parsed, workspaceId: ctx.workspaceId },
      { prisma, callLlm: makeCallLlmAdapter() },
    )
    return ApiResponse.ok(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误"
    logger.error("POST /api/harness/generate-spec: 失败", { error: message })
    return ApiResponse.error(`Spec 生成失败：${message}`, 502)
  }
}, "MEMBER")
