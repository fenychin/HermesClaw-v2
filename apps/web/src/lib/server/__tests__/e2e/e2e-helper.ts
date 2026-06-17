import { prisma } from "@/lib/prisma"

/**
 * 级联物理清理测试产生的 workspace 及其全部关联记录
 */
export async function cleanWorkspace(workspaceId: string): Promise<void> {
  try {
    // 按照外键依赖顺序，从子表向父表逐级删除，防范外键约束报错
    await prisma.harnessRollback.deleteMany({ where: { workspaceId } })
    await prisma.harnessCanary.deleteMany({ where: { workspaceId } })
    await prisma.harnessSnapshot.deleteMany({ where: { workspaceId } })
    await prisma.harnessProposal.deleteMany({ where: { workspaceId } })
    await prisma.approvalCheckpoint.deleteMany({ where: { workspaceId } })
    await prisma.stepRun.deleteMany({ where: { workspaceId } })
    await prisma.workflowNodeRun.deleteMany({ where: { workspaceId } })
    await prisma.workflowRun.deleteMany({ where: { workspaceId } })
    await prisma.workflow.deleteMany({ where: { workspaceId } })
    await prisma.agentLog.deleteMany({ where: { workspaceId } })
    await prisma.auditLog.deleteMany({ where: { workspaceId } })
    await prisma.project.deleteMany({ where: { workspaceId } })
    await prisma.agent.deleteMany({ where: { workspaceId } })
    
    // 清理 settings 及 workspace member
    await prisma.workspaceSettings.deleteMany({ where: { workspaceId } })
    await prisma.workspaceMember.deleteMany({ where: { workspaceId } })
    
    // 最后删除 workspace
    await prisma.workspace.deleteMany({ where: { id: workspaceId } })
  } catch (error) {
    console.error(`[cleanWorkspace] Failed to cleanup workspace ${workspaceId}:`, error)
  }
}

/**
 * 为 E2E 测试快速初始化一套完整的 Workspace 基础设施数据
 */
export async function setupWorkspace(
  workspaceId: string,
  options?: {
    automationLevel?: string
    agentId?: string
    agentAutomationLevel?: string
    workflowId?: string
    workflowNodes?: any[]
    workflowEdges?: any[]
  }
): Promise<void> {
  const automationLevel = options?.automationLevel || "L2"
  const agentId = options?.agentId || "agent-e2e-001"
  const agentAutomationLevel = options?.agentAutomationLevel || "L2"
  const workflowId = options?.workflowId || "wf-e2e-001"

  // 1. 创建 Workspace
  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: { automationLevel },
    create: {
      id: workspaceId,
      name: `E2E Test Workspace - ${workspaceId}`,
      automationLevel,
      plan: "free"
    }
  })

  // 2. 创建 WorkspaceSettings
  await prisma.workspaceSettings.upsert({
    where: { workspaceId },
    update: {},
    create: {
      workspaceId,
      defaultModel: "deepseek-chat",
      taskProviderMap: JSON.stringify({
        chat: "deepseek",
        workflow: "deepseek",
        analysis: "deepseek",
        generation: "deepseek"
      }),
      workflowEngine: "local"
    }
  })

  // 3. 创建 Agent
  await prisma.agent.upsert({
    where: { id: agentId },
    update: { automationLevel: agentAutomationLevel },
    create: {
      id: agentId,
      workspaceId,
      name: `E2E Agent - ${agentId}`,
      role: "assistant",
      description: "E2E integration test agent helper",
      status: "idle",
      source: "custom",
      category: JSON.stringify(["test"]),
      bindSkills: JSON.stringify([]),
      bindConnectors: JSON.stringify([]),
      canDo: JSON.stringify(["execute workflows"]),
      cannotDo: JSON.stringify(["make financial decisions"]),
      statsJson: JSON.stringify({}),
      automationLevel: agentAutomationLevel
    }
  })

  // 4. 创建 Workflow
  const defaultNodes = [
    { id: "node-1", kind: "skill-call", config: { capabilityId: "skill-followup", nodeType: "skill-call" } },
    { id: "node-2", kind: "connector-call", config: { capabilityId: "connector-email", nodeType: "connector-call" } }
  ]
  const defaultEdges = [
    { from: "node-1", to: "node-2" }
  ]

  const nodes = options?.workflowNodes || defaultNodes
  const edges = options?.workflowEdges || defaultEdges

  await prisma.workflow.upsert({
    where: { id: workflowId },
    update: {
      nodes: JSON.stringify(nodes),
      edges: JSON.stringify(edges)
    },
    create: {
      id: workflowId,
      workspaceId,
      name: `E2E Workflow - ${workflowId}`,
      description: "E2E integration test workflow template",
      status: "active",
      nodes: JSON.stringify(nodes),
      edges: JSON.stringify(edges)
    }
  })
}
