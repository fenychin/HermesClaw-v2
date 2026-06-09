import { hermesClient } from '@/lib/server/adapters/hermes'
import { NextRequest } from 'next/server'
import { ApiResponse } from '@/lib/server/api-response'

// POST /api/harness/evaluate
// 触发 Harness 评估，返回升级提案
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = await hermesClient.evaluateHarness(body)
    return ApiResponse.ok(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return ApiResponse.error(message, 500)
  }
}
