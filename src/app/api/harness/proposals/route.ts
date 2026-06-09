import { NextRequest } from 'next/server'
import { ApiResponse } from '@/lib/server/api-response'
import { mockProposals } from '@/lib/server/mock-store'

// GET /api/harness/proposals
// 获取提案列表（支持 ?status=pending 查询）
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    
    let result = mockProposals
    if (status) {
      result = result.filter(p => p.status === status)
    }
    
    return ApiResponse.ok(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return ApiResponse.error(message, 500)
  }
}
