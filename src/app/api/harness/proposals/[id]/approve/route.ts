import { NextRequest } from 'next/server'
import { ApiResponse } from '@/lib/server/api-response'
import { getMockProposal, updateMockProposalStatus } from '@/lib/server/mock-store'
import { checkAutomationGate } from '@/lib/server/guardrail'

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

    // 自动化授权分级门禁（AGENTS.md §4.7）—— 使用共享护栏函数
    const gateResult = await checkAutomationGate({
      automationLevel: proposal.proposedChange.automationLevel ?? null,
      riskLevel: proposal.proposedChange.riskLevel,
      confirmed: body.confirmText === '确认执行',
      actionName: '批准',
    })
    if (!gateResult.ok) return gateResult.response

    // 更新状态
    updateMockProposalStatus(id, 'approved')

    return ApiResponse.ok({ proposalId: id, approvedAt: new Date().toISOString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return ApiResponse.error(message, 500)
  }
}
