import { NextRequest } from 'next/server'
import { ApiResponse } from '@/lib/server/api-response'
import { getMockProposal, updateMockProposalStatus } from '@/lib/server/mock-store'

// POST /api/harness/proposals/:id/approve
// 批准提案（L4 硬拒绝 403）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // 处理空 body 的情况
    let body: { confirmText?: string } = {}
    try {
      body = await req.json()
    } catch {
      // 忽略解析错误，允许空 body
    }

    // 从 mock/store 获取提案
    const proposal = getMockProposal(id)
    if (!proposal) return ApiResponse.error('提案不存在', 404)

    // L4 硬拒绝 —— 遵循 AGENTS.md §4.7
    if (proposal.proposedChange.automationLevel === 'L4') {
      return ApiResponse.error('L4 级别操作禁止通过审批 API 自动批准，须在源业务系统手动发起', 403)
    }

    // L3 检查二次确认字段
    if (proposal.proposedChange.automationLevel === 'L3' && body.confirmText !== '确认执行') {
      return ApiResponse.error('缺少 L3 二次确认文本', 409)
    }

    // 更新状态
    updateMockProposalStatus(id, 'approved')

    return ApiResponse.ok({ proposalId: id, approvedAt: new Date().toISOString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return ApiResponse.error(message, 500)
  }
}
