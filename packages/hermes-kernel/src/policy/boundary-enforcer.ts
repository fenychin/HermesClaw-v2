import { DOMAIN_OWNERSHIP } from "@hermesclaw/event-contracts"

export interface EnforceBoundaryParams {
  agentId: string
  workspaceId: string
  targetWorkspaceId: string
  prisma: any
}

export interface EnforceBoundaryResult {
  allowed: boolean
  violation?: string
}

export async function enforceBoundary(
  params: EnforceBoundaryParams,
): Promise<EnforceBoundaryResult> {
  const { agentId, workspaceId, targetWorkspaceId, prisma } = params

  if (workspaceId === targetWorkspaceId) {
    return { allowed: true }
  }

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, workspaceId: targetWorkspaceId },
    select: { id: true },
  })

  if (!agent) {
    return {
      allowed: false,
      violation: "智能体不存在于目标 Workspace",
    }
  }

  return { allowed: true }
}

type AutomationLevel = "L1" | "L2" | "L3" | "L4"
type RiskLevel = "low" | "medium" | "high"

export interface EnforceAutomationGateParams {
  automationLevel: AutomationLevel
  riskLevel: RiskLevel
  workspaceId: string
  prisma: any
  confirmed?: boolean
}

export interface EnforceAutomationGateResult {
  allowed: boolean
  requiresApproval: boolean
  message?: string
}

export async function enforceAutomationGate(
  params: EnforceAutomationGateParams,
): Promise<EnforceAutomationGateResult> {
  const { automationLevel, riskLevel, workspaceId, prisma, confirmed } = params

  if (automationLevel === "L1" || automationLevel === "L2") {
    return { allowed: true, requiresApproval: false }
  }

  if (automationLevel === "L4") {
    return {
      allowed: false,
      requiresApproval: true,
      message: `L4 自动化等级需要人工审批`,
    }
  }

  if (automationLevel === "L3") {
    if (confirmed) {
      return { allowed: true, requiresApproval: false }
    }

    try {
      const ws = await prisma.workspaceSettings.findUnique({
        where: { workspaceId },
        select: { maxAutomationLevel: true },
      })
      if (
        ws?.maxAutomationLevel === "L3" ||
        ws?.maxAutomationLevel === "L4"
      ) {
        return { allowed: true, requiresApproval: false }
      }
    } catch {
      /* 静默降级 */
    }

    return {
      allowed: true,
      requiresApproval: true,
      message: `L3 ${riskLevel} 操作需要确认`,
    }
  }

  return {
    allowed: false,
    requiresApproval: true,
    message: "未知自动化等级",
  }
}
