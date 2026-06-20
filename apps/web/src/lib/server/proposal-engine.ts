import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/server/audit"
import type { HarnessProposal } from "@hermesclaw/event-contracts"
import type { EvaluationReport } from "@hermesclaw/event-contracts"
import type { Prisma } from "@/generated/prisma-v2/client"
import crypto from "crypto"

/**
 * 基于评估报告自动生成 Harness 升级提案（generateProposal）
 * —— 落地 AGENTS.md §5.4 提案输出与进化闭环
 *
 * @param evaluationReport 评估报告对象
 * @returns 组装好的且已写入数据库的 HarnessProposal
 */
export async function generateProposal(evaluationReport: EvaluationReport): Promise<HarnessProposal> {
  const workspaceId = evaluationReport.workspaceId || "default"
  const errorRate = evaluationReport.metrics.errorRate
  
  // 智能决策分流
  let targetComponent: "任务边界" | "上下文供给" | "工具接入" = "任务边界"
  let proposedChangeText = "WorkflowTemplate 调整"
  let problemStatement = "评估报告显示系统错误率偏高"
  let estimatedImpact = "优化工作流拓扑，预计降低失败率 30%"
  let automationLevel: "L1" | "L2" | "L3" | "L4" = "L2"
  let proposalRiskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'

  const errorRatePct = (errorRate * 100).toFixed(1)
  const logSummary = `ErrorRate: ${errorRatePct}%\nSuccessRate: ${((evaluationReport.metrics.successRate ?? (1 - errorRate)) * 100).toFixed(1)}%\nTotal: ${evaluationReport.metrics.total}`

  try {
    const { selectModel } = await import("./model-router")
    const { analyzeHarnessLogs } = await import("./harness-llm")
    const { getBrainStats } = await import("./brain")

    const routing = await selectModel({
      workspaceId,
      riskLevel: "low",
      taskType: "workflow",
      estimatedTokens: 1000,
    })

    let memoryContext: string | undefined = undefined
    try {
      const stats = await getBrainStats(workspaceId)
      memoryContext = `智慧大脑记忆状态快照：
- 记忆检索命中率：${(stats.hitRate * 100).toFixed(1)}%
- 节省 Token 数：${stats.tokensSaved}
- 发现的知识缺口（盲区）：
${stats.knowledgeGaps.map(g => `  * [${g.resolved ? "已解决" : "待补充"}] ${g.description} (建议: ${g.suggestedAction})`).join("\n")}`
    } catch (err) {
      memoryContext = "获取知识库快照失败，请基于通用推理执行。"
    }

    const analysis = await analyzeHarnessLogs({
      logSummary,
      metrics: {
        total: 10,
        errors: Math.round(errorRate * 10),
        success: 10 - Math.round(errorRate * 10),
        errorRate: errorRate,
        successRate: 1 - errorRate,
        windowHours: 24,
      },
      provider: routing.provider,
      model: routing.model,
      memoryContext,
    })

    if (analysis && analysis.draft) {
      const draft = analysis.draft
      targetComponent = (draft.targetComponent || "任务边界") as any
      proposedChangeText = draft.proposedChange
      problemStatement = draft.problemStatement
      estimatedImpact = draft.estimatedImpact
      proposalRiskLevel = draft.riskLevel as any
      automationLevel = "L2" // 智能提案默认以 L2 安全等级进行灰度
    }
  } catch (err: any) {
    // 【必须】写入 AuditLog，降级事件不能静默
    await writeAuditLog({
      actor: "system",
      action: "proposal.generation.fallback",
      targetType: "proposal",
      targetId: `eval:${evaluationReport.workspaceId}`,
      detail: `AI 提案生成失败，降级至硬编码规则。错误: ${err.message}`,
      riskLevel: "medium",
      workspaceId: evaluationReport.workspaceId,
    })
    // 柔性降级（保底）：若大模型调用异常或无密钥，安全降级至硬编码规则分流引擎
    console.warn("[generateProposal] AI 提案生成失败，降级至硬编码规则分流:", err.message)
    if (errorRate > 0.3) {
      targetComponent = "任务边界"
      proposedChangeText = "WorkflowTemplate 调整：工作流节点路由与超时机制重构"
      problemStatement = `评估窗口内系统失败率高达 ${(errorRate * 100).toFixed(1)}%，触发工作流自适应降级`
      estimatedImpact = "解耦长任务节点路由，预计将运行失败率降低至 15% 以下"
      proposalRiskLevel = "high"
      automationLevel = "L2"
    } else if (errorRate > 0.1) {
      targetComponent = "工具接入"
      proposedChangeText = "SkillBinding 调整：更换底层备用技能模型，提高识别准确率"
      problemStatement = `系统存在一定的人工干预修正，失败率为 ${(errorRate * 100).toFixed(1)}%`
      estimatedImpact = "提高工具参数匹配精度，预计人工修正率下降 50%"
      proposalRiskLevel = "medium"
      automationLevel = "L3"
    } else {
      targetComponent = "上下文供给"
      proposedChangeText = "MemoryPolicy 调整：压缩策略门禁优化，提前进行上下文摘要"
      problemStatement = "检测到长周期会话中的上下文冗余，需要优化记忆存储分配"
      estimatedImpact = "减少 Token 消耗，提高推理上下文响应速度"
      proposalRiskLevel = "low"
      automationLevel = "L3"
    }
  }

  const proposalId = `HEP-${Date.now()}`
  const id = crypto.randomUUID()
  const evidence = evaluationReport.reportMd ? [evaluationReport.reportMd] : ["评估窗口内任务数据分析"]
  
  const proposedChange = {
    targetComponent,
    description: proposedChangeText,
    riskLevel: proposalRiskLevel,
    automationLevel,
  }

  const snapshot = {
    agentId: "default-agent",
    canDo: ["*"],
    cannotDo: [],
    bindConnectors: [],
    bindSkills: [],
    harnessVersion: "v1.0.0",
    snapshotAt: new Date().toISOString()
  }

  const dbData: any = {
    id,
    proposalId,
    workspaceId,
    triggeredBy: "auto",
    triggerReason: "评估窗口指标触发自适应优化规则",
    problemStatement,
    evidence: JSON.stringify(evidence),
    proposedChange: proposedChange as unknown as Prisma.InputJsonValue,
    targetSkillId: null,
    requiresHumanApproval: true,
    estimatedImpact,
    affectedAgents: JSON.stringify([]),
    rollbackPlan: "一键恢复关联 Agent 至之前的 Harness 快照版本",
    status: "draft", // 初始状态为 draft
    previousSnapshot: snapshot
  }

  // 写入数据库
  const created = await prisma.harnessProposal.create({
    data: dbData
  })

  // 写入系统审计日志（action: 'proposal.create'）
  await writeAuditLog({
    actor: "system",
    action: "proposal.create",
    targetType: "proposal",
    targetId: id,
    detail: `自动生成提案 ${proposalId}: ${proposedChangeText}`,
    riskLevel: "medium",
    workspaceId
  })

  // 组装并返回 HarnessProposal
  const proposal: HarnessProposal = {
    id: created.id,
    workspaceId: created.workspaceId,
    proposalId: created.proposalId,
    triggeredBy: created.triggeredBy as "auto" | "manual",
    triggerReason: created.triggerReason,
    problemStatement: created.problemStatement,
    evidence: JSON.parse(created.evidence as string) as string[],
    proposedChange: created.proposedChange as unknown as HarnessProposal["proposedChange"],
    targetSkillId: created.targetSkillId,
    requiresHumanApproval: created.requiresHumanApproval,
    estimatedImpact: created.estimatedImpact,
    affectedAgents: JSON.parse(created.affectedAgents as string) as string[],
    rollbackPlan: created.rollbackPlan,
    status: created.status as unknown as HarnessProposal["status"],
    reviewedBy: created.reviewedBy,
    reviewedAt: created.reviewedAt ? new Date(created.reviewedAt) : null,
    previousSnapshot: typeof created.previousSnapshot === "string"
      ? JSON.parse(created.previousSnapshot)
      : created.previousSnapshot,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    version: "1.0.0"
  }

  // 在 generateProposal 返回前追加（使用动态 import 防止循环依赖）
  if (proposal.proposedChange && (proposal.proposedChange.riskLevel === 'high' || proposal.proposedChange.riskLevel === 'critical')) {
    const { createApprovalCheckpoint } = await import('./approval')
    await createApprovalCheckpoint({
      proposalId: proposal.id,
      workspaceId: proposal.workspaceId,
      triggerReason: 'eval.proposal.generated',
      riskLevel: proposal.proposedChange.riskLevel,
      automationLevel: 'L3',
      actionSummary: `自动进化提案待审批：${proposal.proposedChange.description ?? proposal.id}`,
      inputSnapshot: proposal as unknown as Record<string, unknown>,
      policySnapshotVersion: snapshot.agentId || 'unknown',
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),  // 72 小时有效期
    })
  }

  return proposal
}
