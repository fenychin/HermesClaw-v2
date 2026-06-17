/**
 * POST /api/harness/generate-spec —— AI 生成 Harness Spec
 */
import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { rateLimit } from "@/lib/rate-limit"
import { validateBody } from "@/lib/server/validators"
import { HarnessSpecGenerateSchema } from "@hermesclaw/event-contracts"
import { generateHarnessSpec } from "@/lib/server/harness/harness-spec-generator"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  if (!rateLimit(ip, 5, 60_000)) return errorResponse("请求过于频繁，请稍后重试", 429)
  try {
    const raw = await req.json()
    const parsed = validateBody(raw, HarnessSpecGenerateSchema)
    if (parsed instanceof Response) return parsed
    const result = await generateHarnessSpec(parsed)
    return successResponse(result)
  } catch (error) {
    logger.error("POST /api/harness/generate-spec: 失败", { error: error instanceof Error ? error.message : "未知错误" })
    return errorResponse(`Spec 生成失败：${error instanceof Error ? error.message : "未知错误"}`, 502)
  }
}
