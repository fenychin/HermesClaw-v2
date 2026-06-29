import { prisma } from "@/lib/prisma"
import { withRBAC } from "@/lib/server/api-handler"
import type { RouteContext } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { ApiResponse } from "@/lib/server/api-response"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import crypto from "crypto"

export const PUT = withRBAC<{ params: Promise<{ id: string }> }>(async (request: Request, ctx: WorkspaceContext, routeContext: RouteContext<{ id: string }>) => {
  const { id: agentId } = await routeContext.params
  const actor = await actorFromSession()

  // 1. 验证 Agent 存在性
  const agent = await prisma.agent.findUnique({
    where: { id: agentId, workspaceId: ctx.workspaceId }
  })
  if (!agent) {
    return ApiResponse.error("智能体不存在", 404)
  }

  // 2. 验证并解析 body
  let body: any = {}
  try {
    body = await request.json()
  } catch {
    return ApiResponse.error("请求体解析失败", 400)
  }

  const patches = body.skillBindings
  if (!Array.isArray(patches)) {
    return ApiResponse.error("参数 'skillBindings' 必须是数组", 400)
  }

  // 计算出更新后的全量绑定列表
  let currentBoundIds: string[] = []
  try {
    currentBoundIds = JSON.parse(agent.bindSkills || "[]")
  } catch {}
  
  const boundSet = new Set<string>(currentBoundIds)
  
  for (const patch of patches) {
    if (typeof patch !== "object" || !patch.skillId) {
      return ApiResponse.error("绑定配置格式错误", 400)
    }
    if (patch.enabled) {
      boundSet.add(patch.skillId)
    } else {
      boundSet.delete(patch.skillId)
    }
  }

  const finalSkillIds = Array.from(boundSet)

  // 检查这些技能在 workspace 内是否存在
  const dbSkills = await prisma.skill.findMany({
    where: {
      id: { in: finalSkillIds },
      workspaceId: ctx.workspaceId
    }
  })
  
  // 3. 创建 HarnessProposal 提案与二阶段审计
  const auditEntry = await createAuditEntry({
    actor,
    action: "skill.bind.proposal",
    targetType: "proposal",
    targetId: "pending",
    detail: `提交智能体「${agent.name}」的技能绑定变更提案`,
    riskLevel: "medium",
    workspaceId: ctx.workspaceId,
    automationLevel: "L3",
    triggeredBy: "user"
  })

  try {
    const proposalId = `HEP-${Date.now()}`
    const proposalDbId = crypto.randomUUID()

    // 查找将要绑定的技能显示名称，用于显示
    const skillNames = dbSkills.map(s => s.name)

    const proposal = await prisma.harnessProposal.create({
      data: {
        id: proposalDbId,
        proposalId,
        workspaceId: ctx.workspaceId,
        title: `修改智能体「${agent.name}」的技能绑定`,
        severity: "medium",
        proposalType: "skill_binding",
        triggeredBy: "manual",
        triggerReason: "用户手动调整技能绑定",
        problemStatement: `智能体 ${agent.name} 需要重新绑定技能`,
        evidence: JSON.stringify(["用户在智能体编辑器中手动提交变更"]),
        proposedChange: {
          targetComponent: "skill_binding",
          description: `将智能体「${agent.name}」的技能绑定修改为 ${skillNames.join(", ") || "无"}`,
          agentId: agent.id,
          skillBindings: finalSkillIds
        },
        requiresHumanApproval: true,
        estimatedImpact: "更新智能体可用技能范围",
        affectedAgents: JSON.stringify([agent.id]),
        rollbackPlan: "一键恢复关联 Agent 至之前的 Harness 快照版本",
        status: "pending",
        previousSnapshot: {
          agentId: agent.id,
          bindSkills: JSON.parse(agent.bindSkills || "[]"),
          bindConnectors: JSON.parse(agent.bindConnectors || "[]"),
          harnessVersion: agent.harnessVersion
        }
      }
    })

    // 4. 创建人工审批检查点
    const { createApprovalCheckpoint, PROPOSAL_APPROVAL_EXPIRY_MS } = await import('@/lib/server/approval')
    await createApprovalCheckpoint({
      proposalId: proposal.id,
      workspaceId: proposal.workspaceId,
      triggerReason: 'manual.escalation',
      riskLevel: 'medium',
      automationLevel: 'L3',
      actionSummary: `修改智能体技能绑定待审批：${proposal.title}`,
      inputSnapshot: {
        proposalId: proposal.id,
        agentId: agent.id,
        proposedSkills: finalSkillIds
      },
      policySnapshotVersion: agent.harnessVersion || '1.0.0',
      expiresAt: new Date(Date.now() + PROPOSAL_APPROVAL_EXPIRY_MS),
      creator: actor
    })

    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "success",
      detail: `提案已创建：${proposal.id}`
    })

    return ApiResponse.ok({ proposalId: proposal.proposalId })

  } catch (err: any) {
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "failed",
      detail: err.message
    })
    return ApiResponse.error(`提交绑定变更提案失败: ${err.message}`, 500)
  }
}, "MEMBER")

// 兼容 PATCH 请求
export const PATCH = PUT
