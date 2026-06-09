import { NextRequest } from 'next/server'
import { ApiResponse } from '@/lib/server/api-response'
import { getMockProposal, updateMockProposalStatus } from '@/lib/server/mock-store'

// POST /api/harness/proposals/:id/reject
// 拒绝提案
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const proposal = getMockProposal(id)
    if (!proposal) return ApiResponse.error('提案不存在', 404)

    updateMockProposalStatus(id, 'rejected')

    return ApiResponse.ok({ proposalId: id, rejectedAt: new Date().toISOString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return ApiResponse.error(message, 500)
  }
}
