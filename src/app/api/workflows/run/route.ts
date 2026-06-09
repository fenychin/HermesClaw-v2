import { hermesClient } from '@/lib/server/adapters/hermes'
import { NextRequest } from 'next/server'
import { ApiResponse } from '@/lib/server/api-response'

// POST /api/workflows/run
// 执行工作流，通过 Hermes Adapter 路由
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // 基础参数校验
    if (!body.workflowId || !body.inputs) {
      return ApiResponse.error('缺少必要参数', 400)
    }
    const result = await hermesClient.runWorkflow(body)
    return ApiResponse.ok(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return ApiResponse.error(message, 500)
  }
}
