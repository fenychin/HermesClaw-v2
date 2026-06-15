/**
 * AutomationPolicy 数据访问层（Route → Service → Repository 三层抽象）
 *
 * —— route 层禁止直接 import `@/lib/prisma`，因此把 CRUD 收敛到本文件。
 * —— 业务规则（升级门禁、三级回退）在 src/lib/automation/* 中实现，
 *    本文件只暴露薄数据访问 wrapper。
 */

import { prisma } from "@/lib/prisma"

export interface AutomationPolicyRow {
  id: string
  workspaceId: string
  agentId: string | null
  actionType: string | null
  automationLevel: string
  riskLevel: string
  requireApproval: boolean
  requireApproverIds: string
  priority: number
  description: string | null
  createdBy: string
  updatedBy: string
  createdAt: Date
  updatedAt: Date
}

export interface CreatePolicyInput {
  workspaceId: string
  agentId: string | null
  actionType: string | null
  automationLevel: string
  riskLevel: string
  requireApproval: boolean
  requireApproverIds: string
  priority: number
  description: string | null
  createdBy: string
  updatedBy: string
}

export interface UpdatePolicyInput {
  automationLevel?: string
  riskLevel?: string
  requireApproval?: boolean
  requireApproverIds?: string
  priority?: number
  description?: string | null
  updatedBy: string
}

export async function listPolicies(workspaceId: string): Promise<AutomationPolicyRow[]> {
  return prisma.automationPolicy.findMany({
    where: { workspaceId },
    orderBy: [
      { agentId: "asc" },
      { actionType: "asc" },
      { priority: "desc" },
      { createdAt: "asc" },
    ],
  })
}

export async function findPolicyById(policyId: string): Promise<AutomationPolicyRow | null> {
  return prisma.automationPolicy.findUnique({ where: { id: policyId } })
}

export async function createPolicy(input: CreatePolicyInput): Promise<AutomationPolicyRow> {
  return prisma.automationPolicy.create({ data: input })
}

export async function updatePolicy(
  policyId: string,
  patch: UpdatePolicyInput,
): Promise<AutomationPolicyRow> {
  return prisma.automationPolicy.update({
    where: { id: policyId },
    data: patch,
  })
}

export async function deletePolicy(policyId: string): Promise<void> {
  await prisma.automationPolicy.delete({ where: { id: policyId } })
}

/**
 * 查询某 workspace 下针对特定 actionType 已审批的 HarnessProposal。
 * envelope 路由的 L3/L4 审批门禁会调用此查询。
 */
export async function findApprovedProposalForAction(
  workspaceId: string,
  actionType: string,
): Promise<{ id: string; reviewedAt: Date | null } | null> {
  const row = await prisma.harnessProposal.findFirst({
    where: {
      workspaceId,
      status: "approved",
      targetSkillId: actionType,
    },
    orderBy: { reviewedAt: "desc" },
    select: { id: true, reviewedAt: true },
  })
  return row
}
