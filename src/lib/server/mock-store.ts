/**
 * Harness 提案服务端 mock 存储
 *
 * —— 单一数据源：直接复用前端审批中心使用的 `_data/mock-proposals.ts`（HarnessProposal 富数据），
 *    保证前后端 proposalId 一致，消除「前端列表项调用 approve API 时 404」的数据鸿沟。
 * —— 在共享数据之上**追加**一条 L4 提案，用于验证 §4.7 L4 审批硬拦截（前端 _data 未含 L4）。
 *
 * 注意：审批/拒绝会原地改 status，故服务端持一份可变副本（runtime copy），
 *       与前端 bundle 中的同名数组互不影响（服务端 / 客户端为不同运行时）。
 */
import type { HarnessProposal } from "@/types"
import { mockProposals as sharedProposals } from "@/app/(workspace)/settings/harness/_data/mock-proposals"

/** L4 演示提案：高危 + L4，审批 API 必须硬拒绝（403 L4_FORBIDDEN） */
const L4_DEMO_PROPOSAL: HarnessProposal = {
  id: "hep-l4-demo",
  proposalId: "HEP-L4-DEMO",
  triggeredBy: "auto",
  triggerReason: "外部资金调度类动作触发安全护栏",
  problemStatement:
    "系统检测到一条涉及外部资金调度的自动化提案。依据 AGENTS.md §4.5/§4.7，此类动作为 L4 级别，系统永不自动执行，审批通道亦不得放行。",
  evidence: [
    "动作分类：finance.payment（L4 绝对禁止自动）",
    "护栏判定：automationLevel=L4，approve API 须硬拒绝 403",
  ],
  proposedChange: {
    targetComponent: "安全护栏",
    description:
      "自动发起一笔供应商货款支付。该动作涉及外部资金调度，属 L4 绝对禁止自动等级。",
    riskLevel: "high",
    automationLevel: "L4",
  },
  requiresHumanApproval: true,
  estimatedImpact: "若误放行将造成不可逆的资金损失，故审批通道必须硬拒绝。",
  affectedAgents: ["报价单 Agent", "财务 Agent"],
  rollbackPlan: "L4 动作不经审批通道执行，无系统级回滚；须由人工在源业务系统撤销。",
  status: "pending",
  createdAt: "2026-06-09T10:00:00Z",
}

/** 服务端可变副本：共享提案 + L4 演示提案 */
export const mockProposals: HarnessProposal[] = [
  ...sharedProposals.map((p) => ({ ...p })),
  L4_DEMO_PROPOSAL,
]

/** 按 proposalId 查找提案（路由 [id] 即 proposalId） */
export function getMockProposal(proposalId: string): HarnessProposal | undefined {
  return mockProposals.find((p) => p.proposalId === proposalId)
}

/** 原地更新提案状态 */
export function updateMockProposalStatus(
  proposalId: string,
  status: HarnessProposal["status"],
): void {
  const proposal = getMockProposal(proposalId)
  if (proposal) {
    proposal.status = status
  }
}
