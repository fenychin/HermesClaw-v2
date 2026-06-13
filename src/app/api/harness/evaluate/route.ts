import { hermesClient } from '@/lib/server/adapters/hermes'
import { NextRequest } from 'next/server'
import { ApiResponse } from '@/lib/server/api-response'
import { z } from "zod"
import { validateBody } from "@/lib/validators"

/** POST /api/harness/evaluate 请求体 schema（对齐 HermesHarnessEvaluateRequest） */
const HarnessEvaluateSchema = z.object({
  agentId: z.string().min(1),
  triggerReason: z.string().min(1),
  evidenceLogs: z.array(z.string()).optional(),
})

// POST /api/harness/evaluate
// 触发 Harness 评估，返回升级提案
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json()
    const body = validateBody(raw, HarnessEvaluateSchema)
    if (body instanceof Response) return body
    const result = await hermesClient.evaluateHarness(body)
    return ApiResponse.ok(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return ApiResponse.error(message, 500)
  }
}
