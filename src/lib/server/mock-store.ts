export interface MockProposal {
  proposalId: string
  triggeredBy: string
  problemStatement: string
  proposedChange: {
    targetComponent: string
    description: string
    riskLevel: 'low' | 'mid' | 'high'
    automationLevel?: 'L1' | 'L2' | 'L3' | 'L4'
  }
  requiresHumanApproval: boolean
  estimatedImpact: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

export const mockProposals: MockProposal[] = [
  {
    proposalId: 'HEP-1717800000000',
    triggeredBy: '自动评估',
    problemStatement: '模拟检测到工具调用成功率低于阈值（82%），需要评估当前 Harness 配置',
    proposedChange: {
      targetComponent: '工具接入',
      description: '建议调整超时阈值并增加重试机制，优化工具接入层的容错能力',
      riskLevel: 'mid',
      automationLevel: 'L2',
    },
    requiresHumanApproval: true,
    estimatedImpact: '预计将工具调用成功率提升至 95% 以上，降低任务中断频率',
    status: 'pending',
    createdAt: new Date().toISOString(),
  },
  {
    proposalId: 'HEP-1717800000001',
    triggeredBy: '手动触发',
    problemStatement: '当前系统无数据清理机制',
    proposedChange: {
      targetComponent: '安全护栏',
      description: '增加自动清理 30 天前过期任务日志的逻辑',
      riskLevel: 'high',
      automationLevel: 'L4', // L4 绝对禁止自动
    },
    requiresHumanApproval: true,
    estimatedImpact: '减少存储占用',
    status: 'pending',
    createdAt: new Date().toISOString(),
  },
  {
    proposalId: 'HEP-1717800000002',
    triggeredBy: '自动评估',
    problemStatement: '知识库同步失败',
    proposedChange: {
      targetComponent: '上下文供给',
      description: '强制执行全量知识库拉取',
      riskLevel: 'high',
      automationLevel: 'L3', // 需人工确认
    },
    requiresHumanApproval: true,
    estimatedImpact: '知识库同步恢复',
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
]

export function getMockProposal(id: string): MockProposal | undefined {
  return mockProposals.find(p => p.proposalId === id)
}

export function updateMockProposalStatus(id: string, status: 'approved' | 'rejected') {
  const proposal = getMockProposal(id)
  if (proposal) {
    proposal.status = status
  }
}
