/**
 * HarnessEvolutionEngine — 外贸行业 Agent 自进化引擎
 * 
 * 职责：
 * 1. 接收每次任务的 AgentTaskEvaluation
 * 2. 执行 KPI 偏差检测
 * 3. 自动写入短期/中期记忆补丁
 * 4. 检测是否触发 HarnessProposal（需人工审批）
 * 
 * 三域约束：
 * - 只修改 industry-pack 层的 agent配置
 * - 不直接修改 Hermes 调度逻辑
 * - 所有 longTerm 记忆写入必须经 Proposal 审批
 */

import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/server/audit"

// ── 类型定义（对应 agent-evolution.schema.yaml）──────────────────

export type OutcomeLabel = "success" | "partial_success" | "failure" | "human_override"

export type TriggerType =
  | "kpi_degradation"
  | "kpi_breakthrough"
  | "failure_pattern"
  | "human_override_spike"
  | "new_pattern_detected"

export type ProposalType =
  | "upgrade_automation_level"
  | "update_baseline"
  | "add_skill"
  | "remove_skill"
  | "update_knowledge"
  | "update_canDo"
  | "update_automationGate"

export interface AgentTaskEvaluation {
  agentId: string
  taskId: string
  workflowRunId: string       // 必须来自真实 DB，非随机
  executedAt: Date
  durationMs: number
  kpiSnapshot: Record<string, number>
  baselineSnapshot: Record<string, number>
  outcomeLabel: OutcomeLabel
  failureReason?: string
  memoryPatchSuggestion: {
    shortTermUpdates: string[]
    midTermUpdates: string[]
    longTermCandidates: string[]
  }
  humanFeedback?: {
    rating: number
    comment: string
  }
}

export interface HarnessEvolutionTrigger {
  agentId: string
  triggerType: TriggerType
  detectedAt: Date
  kpiName: string
  currentValue: number
  baselineValue: number
  deviationPct: number
  windowTaskCount: number
  evidenceSampleIds: string[]
}

// ── 进化引擎主类 ─────────────────────────────────────────────────

export class HarnessEvolutionEngine {
  
  /**
   * 主入口：处理一次任务执行评估
   * 由 Hermes EvaluationReport 完成后调用
   */
  async processEvaluation(evaluation: AgentTaskEvaluation): Promise<{
    memoryPatches: string[]
    proposalCreated: string | null
    evolutionTriggered: boolean
  }> {
    const results = {
      memoryPatches: [] as string[],
      proposalCreated: null as string | null,
      evolutionTriggered: false
    }

    // 1. 写入短期/中期记忆补丁（自动，无需审批）
    const patches = await this.writeAutoMemoryPatches(evaluation)
    results.memoryPatches = patches

    // 2. 检测 KPI 偏差是否触发进化
    const trigger = await this.detectEvolutionTrigger(evaluation)
    if (trigger) {
      results.evolutionTriggered = true
      // 3. 生成 HarnessProposal（需人工审批）
      const proposal = await this.createHarnessProposal(trigger, evaluation)
      results.proposalCreated = proposal.proposalId

      // 4. 审计日志
      await writeAuditLog({
        actor: { type: "agent", id: evaluation.agentId },
        action: "HARNESS_PROPOSAL_CREATED",
        targetType: "agent",
        targetId: evaluation.agentId,
        detail: `Agent ${evaluation.agentId} 触发进化提案：${trigger.triggerType} (${trigger.kpiName}: ${(trigger.deviationPct * 100).toFixed(1)}% 偏差)`,
        riskLevel: "medium",
        workspaceId: "system",
        contextSnapshot: { trigger, proposalId: proposal.proposalId }
      })
    }

    // 5. 持久化本次评估记录
    await this.persistEvaluation(evaluation)

    return results
  }

  /**
   * 自动写入短期/中期记忆补丁
   * longTerm 候选项只记录，不实际写入（等待 Proposal 审批）
   */
  private async writeAutoMemoryPatches(
    evaluation: AgentTaskEvaluation
  ): Promise<string[]> {
    const patchIds: string[] = []
    const { agentId, taskId, memoryPatchSuggestion, outcomeLabel } = evaluation

    // shortTerm 补丁：每次执行后自动更新
    for (const update of memoryPatchSuggestion.shortTermUpdates) {
      const patchId = `mp-${agentId}-${taskId}-st-${Date.now()}`
      await prisma.agentMemoryEntry.upsert({
        where: { patchId },
        create: {
          patchId,
          agentId,
          sourceTaskId: taskId,
          patchLayer: "shortTerm",
          operation: "append",
          content: { text: update, outcome: outcomeLabel },
          confidence: outcomeLabel === "success" ? 0.9 : 0.5,
          ttl: 86400 * 3, // 3天过期
          writtenAt: new Date(),
          auditTraceId: evaluation.workflowRunId,
        },
        update: { content: { text: update, outcome: outcomeLabel }, writtenAt: new Date() }
      })
      patchIds.push(patchId)
    }

    // midTerm 补丁：成功经验才写入
    if (outcomeLabel === "success" || outcomeLabel === "partial_success") {
      for (const update of memoryPatchSuggestion.midTermUpdates) {
        const patchId = `mp-${agentId}-${taskId}-mt-${Date.now()}`
        await prisma.agentMemoryEntry.upsert({
          where: { patchId },
          create: {
            patchId,
            agentId,
            sourceTaskId: taskId,
            patchLayer: "midTerm",
            operation: "append",
            content: { text: update, outcome: outcomeLabel },
            confidence: 0.75,
            ttl: 86400 * 90, // 90天
            writtenAt: new Date(),
            auditTraceId: evaluation.workflowRunId,
          },
          update: { content: { text: update }, writtenAt: new Date() }
        })
        patchIds.push(patchId)
      }
    }

    return patchIds
  }

  /**
   * KPI 偏差检测
   * 在最近 evaluationWindow 次任务中检测是否有持续偏差
   */
  private async detectEvolutionTrigger(
    evaluation: AgentTaskEvaluation
  ): Promise<HarnessEvolutionTrigger | null> {

    // 查询该 agent 最近20次评估记录
    const recentEvals = await prisma.agentTaskEvaluation.findMany({
      where: { agentId: evaluation.agentId },
      orderBy: { executedAt: "desc" },
      take: 20
    })

    if (recentEvals.length < 20) return null // 样本不足，不触发

    // 检测连续失败（3次以上）
    const recentFailures = recentEvals.slice(0, 5).filter(
      e => e.outcomeLabel === "failure"
    )
    if (recentFailures.length >= 3) {
      return {
        agentId: evaluation.agentId,
        triggerType: "failure_pattern",
        detectedAt: new Date(),
        kpiName: "successRate",
        currentValue: (20 - recentFailures.length) / 20,
        baselineValue: 0.85,
        deviationPct: -recentFailures.length / 20,
        windowTaskCount: 20,
        evidenceSampleIds: recentFailures.slice(0, 5).map(e => e.taskId)
      }
    }

    // 检测 KPI 持续偏低
    for (const [kpiName, currentValue] of Object.entries(evaluation.kpiSnapshot)) {
      const baseline = evaluation.baselineSnapshot[kpiName]
      if (!baseline) continue
      const deviationPct = (currentValue - baseline) / baseline

      // 查找此 KPI 在近20次任务中的平均值
      const avgValue = recentEvals.reduce((sum, e) => {
        const kpiData = e.kpiSnapshot as Record<string, number>
        return sum + (kpiData[kpiName] ?? baseline)
      }, 0) / recentEvals.length

      const avgDeviation = (avgValue - baseline) / baseline

      // 触发：持续低于基线15%以上
      if (avgDeviation < -0.15) {
        return {
          agentId: evaluation.agentId,
          triggerType: "kpi_degradation",
          detectedAt: new Date(),
          kpiName,
          currentValue: avgValue,
          baselineValue: baseline,
          deviationPct: avgDeviation,
          windowTaskCount: recentEvals.length,
          evidenceSampleIds: recentEvals.slice(0, 5).map(e => e.taskId)
        }
      }

      // 触发：持续超越基线20%以上（可提升自动化等级）
      if (avgDeviation > 0.20) {
        return {
          agentId: evaluation.agentId,
          triggerType: "kpi_breakthrough",
          detectedAt: new Date(),
          kpiName,
          currentValue: avgValue,
          baselineValue: baseline,
          deviationPct: avgDeviation,
          windowTaskCount: recentEvals.length,
          evidenceSampleIds: recentEvals.slice(0, 5).map(e => e.taskId)
        }
      }
    }

    return null
  }

  /**
   * 生成 HarnessProposal
   * 不直接修改 agent 配置，只创建待审批提案
   */
  private async createHarnessProposal(
    trigger: HarnessEvolutionTrigger,
    evaluation: AgentTaskEvaluation
  ): Promise<{ proposalId: string }> {
    const proposalId = `hp-${trigger.agentId}-${Date.now()}`

    const proposalType: ProposalType =
      trigger.triggerType === "kpi_breakthrough"
        ? "upgrade_automation_level"
        : trigger.triggerType === "kpi_degradation"
        ? "update_baseline"
        : "update_knowledge"

    const proposedChanges = this.generateProposedChanges(trigger, proposalType)

    await prisma.harnessProposal.create({
      data: {
        proposalId,
        agentId: trigger.agentId,
        triggerData: trigger as any,
        proposalType,
        currentHarnessVersion: "2.2.0",
        proposedChanges: proposedChanges as any,
        reasoning: this.generateReasoning(trigger),
        expectedImpact: this.generateExpectedImpact(trigger),
        riskAssessment: this.generateRiskAssessment(trigger),
        approvalStatus: "pending",
        createdAt: new Date(),
      }
    })

    return { proposalId }
  }

  private generateProposedChanges(
    trigger: HarnessEvolutionTrigger,
    proposalType: ProposalType
  ): object {
    if (proposalType === "upgrade_automation_level") {
      return {
        field: "automationLevel",
        from: "L2",
        to: "L3",
        rationale: `${trigger.kpiName} 在 ${trigger.windowTaskCount} 次任务中平均超基线 ${(trigger.deviationPct * 100).toFixed(1)}%`
      }
    }
    if (proposalType === "update_baseline") {
      return {
        field: `evalRules.baseline.${trigger.kpiName}`,
        from: trigger.baselineValue,
        to: Number((trigger.baselineValue * 0.95).toFixed(4)),
        rationale: `持续低于基线，建议下调基线以触发更早预警`
      }
    }
    return { field: "knowledgeBase", action: "review_and_update" }
  }

  private generateReasoning(trigger: HarnessEvolutionTrigger): string {
    return `在最近 ${trigger.windowTaskCount} 次任务中，${trigger.kpiName} 平均值为 ${trigger.currentValue.toFixed(3)}，` +
      `当前基线为 ${trigger.baselineValue.toFixed(3)}，偏差 ${(trigger.deviationPct * 100).toFixed(1)}%。` +
      `触发类型：${trigger.triggerType}。建议进行 harness 进化以恢复或提升性能。`
  }

  private generateExpectedImpact(trigger: HarnessEvolutionTrigger): string {
    if (trigger.triggerType === "kpi_breakthrough") {
      return `提升自动化等级后，预计减少人工干预 30-40%，提升响应速度`
    }
    return `调整后预计 ${trigger.kpiName} 恢复至基线水平，减少异常任务比例`
  }

  private generateRiskAssessment(trigger: HarnessEvolutionTrigger): string {
    if (trigger.triggerType === "kpi_breakthrough") {
      return `中等风险：自动化等级提升后减少人工监督，需确保新场景下的安全性`
    }
    return `低风险：基线调整不影响执行逻辑，仅影响预警触发时机`
  }

  private async persistEvaluation(evaluation: AgentTaskEvaluation): Promise<void> {
    await prisma.agentTaskEvaluation.create({
      data: {
        agentId: evaluation.agentId,
        taskId: evaluation.taskId,
        workflowRunId: evaluation.workflowRunId,
        executedAt: evaluation.executedAt,
        durationMs: evaluation.durationMs,
        kpiSnapshot: evaluation.kpiSnapshot as any,
        baselineSnapshot: evaluation.baselineSnapshot as any,
        outcomeLabel: evaluation.outcomeLabel,
        failureReason: evaluation.failureReason,
        memoryPatchSuggestion: evaluation.memoryPatchSuggestion as any,
        humanFeedback: evaluation.humanFeedback as any,
      }
    })
  }
}

export const harnessEvolutionEngine = new HarnessEvolutionEngine()
