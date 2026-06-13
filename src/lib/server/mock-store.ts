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
/**
 * @deprecated Harness 提案现在已迁移至 Prisma 数据库进行持久化存储。
 * 内存 mockProposals 数组已废弃，且已清空。请改用 Prisma。
 */
export const mockProposals: any[] = []

/**
 * @deprecated 请改用 prisma.harnessProposal.findFirst
 */
export function getMockProposal(proposalId: string): any {
  return undefined
}

/**
 * @deprecated 请改用 prisma.harnessProposal.update
 */
export function updateMockProposalStatus(
  proposalId: string,
  status: any,
): void {
  // no-op
}
