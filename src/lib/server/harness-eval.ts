import { FOREIGN_TRADE_BASELINE } from "@/lib/server/industry-health"

// 保留原有的 re-export 声明，确保渐进迁移兼容性
export {
  runHarnessEvaluation,
  type HarnessEvalDeps,
} from "@/lib/server/harness/orchestrator"

export {
  EVAL_WINDOW_HOURS,
  isTrendingUp,
  isErrorStatus,
  buildLogSummary,
  computeMetrics,
} from "@/lib/server/harness/metrics"

export { buildEvaluationReport } from "@/lib/server/harness/report-builder"

// ==============================
// 类型与接口定义
// ==============================

export interface AgentLog {
  id: string
  status: string
  durationMs?: number
  taskName?: string
}

import type { AuditEvent } from "@/lib/server/audit"

export interface ConnectorResult {
  connectorId: string
  success: boolean
  receiptId?: string
}

export interface HumanCorrection {
  runId: string
  correctionMade: boolean
}

export interface MemoryMissEvent {
  key: string
  missed: boolean
}

export interface IndustryKpiSnapshot {
  actualSuccessRate: number
  actualAvgDurationMs: number
}

export interface EvalAnomaly {
  dimension: string
  message: string
  severity: "low" | "medium" | "high"
}

export interface EvalInput {
  workflowRunId: string
  agentLogs: AgentLog[]
  auditEvents: AuditEvent[]
  connectorResults: ConnectorResult[]
  humanCorrections: HumanCorrection[]
  memoryMissEvents: MemoryMissEvent[]
  industryKpiSnapshot: IndustryKpiSnapshot
}

export interface EvalReport {
  runId: string
  evaluatedAt: Date
  overallScore: number // 0-100
  dimensions: {
    connectorSuccessRate: number
    workflowCompletionRate: number
    humanCorrectionRate: number
    memoryHitRate: number
    kpiDriftIndex: number
  }
  anomalies: EvalAnomaly[]
  proposalEligible: boolean
  reportId?: string
  reportMd?: string
}

// 审计入参类型
export interface EvalAuditInput {
  actor: string
  action: string
  targetType: string
  targetId: string
  detail?: string
  riskLevel?: "low" | "medium" | "high"
  workspaceId: string
}

// 可替换依赖，供测试 mock
export interface EvaluationEngineDeps {
  writeAuditLog: (input: EvalAuditInput) => Promise<void>
  generateProposal: (report: unknown) => Promise<unknown>
}

// 使用动态导入，断开测试时对 next-auth 与 next/server 的静态加载链
const defaultDeps: EvaluationEngineDeps = {
  writeAuditLog: async (input) => {
    const { writeAuditLog: wal } = await import("@/lib/server/audit");
    return wal(input);
  },
  generateProposal: async (report) => {
    const { generateProposal: gp } = await import("@/lib/server/proposal-engine");
    return gp(report as Parameters<typeof gp>[0]);
  }
}

// ==============================
// 核心评估引擎实现
// ==============================

/**
 * evaluateHarnessRun — 评估引擎核心入口
 * 读取执行结果并驱动自演化提案流程
 */
export async function evaluateHarnessRun(
  input: EvalInput,
  workspaceId: string = "default",
  deps: EvaluationEngineDeps = defaultDeps
): Promise<EvalReport> {
  const runId = input.workflowRunId || `eval-run-${Date.now()}`;
  
  // 1. 写入审计日志：评估开始
  await deps.writeAuditLog({
    actor: "system",
    action: "EvalStarted",
    targetType: "evaluation",
    targetId: runId,
    detail: `开始对工作流运行进行 Harness 评估，运行ID: ${runId}`,
    riskLevel: "low",
    workspaceId,
  });

  // 2. 指标计算与默认降级逻辑（防空集崩溃）
  
  // 2.1 Connector 成功率
  let connectorSuccessRate = 1.0;
  if (input.connectorResults && input.connectorResults.length > 0) {
    const successCount = input.connectorResults.filter(c => c.success).length;
    connectorSuccessRate = successCount / input.connectorResults.length;
  }

  // 2.2 工作流完成率
  let workflowCompletionRate = 1.0;
  if (input.agentLogs && input.agentLogs.length > 0) {
    const completedCount = input.agentLogs.filter(log => log.status === "completed" || log.status === "success").length;
    workflowCompletionRate = completedCount / input.agentLogs.length;
  }

  // 2.3 人工纠错率
  let humanCorrectionRate = 0.0;
  if (input.humanCorrections && input.humanCorrections.length > 0) {
    const correctionCount = input.humanCorrections.filter(c => c.correctionMade).length;
    humanCorrectionRate = correctionCount / input.humanCorrections.length;
  }

  // 2.4 记忆命中率
  let memoryHitRate = 1.0;
  if (input.memoryMissEvents && input.memoryMissEvents.length > 0) {
    const missCount = input.memoryMissEvents.filter(m => m.missed).length;
    memoryHitRate = 1.0 - (missCount / input.memoryMissEvents.length);
  }

  // 2.5 KPI 偏移指数计算
  // kpiDriftIndex = abs(actual - baseline) / baseline
  let kpiDriftIndex = 0.0;
  if (input.industryKpiSnapshot) {
    const baselineSR = FOREIGN_TRADE_BASELINE.successRate;
    const baselineDur = FOREIGN_TRADE_BASELINE.avgDurationMs;
    
    const srDrift = baselineSR > 0 ? Math.abs(input.industryKpiSnapshot.actualSuccessRate - baselineSR) / baselineSR : 0;
    const durDrift = baselineDur > 0 ? Math.abs(input.industryKpiSnapshot.actualAvgDurationMs - baselineDur) / baselineDur : 0;
    
    kpiDriftIndex = Math.max(srDrift, durDrift);
  }

  // 3. 综合评分计算 (overallScore)
  // 线性加权算法依据：
  // - 成功率及完成率是控制层稳定度核心，各分配 25% 权重。
  // - 人工纠正率严重破坏自动化流程效率，分配 20% 权重。
  // - 记忆效率和 KPI 偏移属于中高阶演化指标，各分配 15% 权重。
  const scoreConnector = connectorSuccessRate * 100;
  const scoreWorkflow = workflowCompletionRate * 100;
  const scoreCorrection = Math.max(0, (1 - humanCorrectionRate) * 100);
  const scoreMemory = memoryHitRate * 100;
  const scoreDrift = Math.max(0, (1 - Math.min(kpiDriftIndex, 1)) * 100);

  const overallScore = Math.round(
    scoreConnector * 0.25 +
    scoreWorkflow * 0.25 +
    scoreCorrection * 0.20 +
    scoreMemory * 0.15 +
    scoreDrift * 0.15
  );

  // 4. 多维异常检测
  const anomalies: EvalAnomaly[] = [];

  if (connectorSuccessRate < 0.85) {
    anomalies.push({
      dimension: "connectorSuccessRate",
      message: `连接器执行成功率异常偏低: ${(connectorSuccessRate * 100).toFixed(1)}% (低于 85% 告警线)`,
      severity: "high",
    });
  }

  if (humanCorrectionRate > 0.15) {
    anomalies.push({
      dimension: "humanCorrectionRate",
      message: `人工纠错率过高: ${(humanCorrectionRate * 100).toFixed(1)}% (高于 15% 告警线)`,
      severity: "medium",
    });
  }

  if (memoryHitRate < 0.70) {
    anomalies.push({
      dimension: "memoryHitRate",
      message: `短期记忆命中率不足: ${(memoryHitRate * 100).toFixed(1)}% (低于 70% 告警线)`,
      severity: "medium",
    });
  }

  if (kpiDriftIndex > 0.20) {
    anomalies.push({
      dimension: "kpiDriftIndex",
      message: `行业关键 KPI 指标偏离度过大: ${(kpiDriftIndex * 100).toFixed(1)}% (高于 20% 告警线)`,
      severity: "high",
    });
  }

  // 4.1 写入异常审计日志
  for (const anomaly of anomalies) {
    await deps.writeAuditLog({
      actor: "system",
      action: "EvalAnomalyDetected",
      targetType: "evaluation",
      targetId: runId,
      detail: `[评估检测到异常] 维度: ${anomaly.dimension}, 严重等级: ${anomaly.severity}, 详情: ${anomaly.message}`,
      riskLevel: anomaly.severity === "high" ? "high" : "medium",
      workspaceId,
    });
  }

  // 5. 触发升级提案判定
  const proposalEligible =
    connectorSuccessRate < 0.85 ||
    humanCorrectionRate > 0.15 ||
    memoryHitRate < 0.70 ||
    kpiDriftIndex > 0.20 ||
    overallScore < 60;

  const report: EvalReport = {
    runId,
    evaluatedAt: new Date(),
    overallScore,
    dimensions: {
      connectorSuccessRate,
      workflowCompletionRate,
      humanCorrectionRate,
      memoryHitRate,
      kpiDriftIndex,
    },
    anomalies,
    proposalEligible,
  };

  // 5.1 自动联动提案引擎生成自演化提案
  if (proposalEligible) {
    const triggerReasons = [];
    if (connectorSuccessRate < 0.85) triggerReasons.push(`连接器成功率 ${(connectorSuccessRate * 100).toFixed(1)}% 低于 85%`);
    if (humanCorrectionRate > 0.15) triggerReasons.push(`人工纠偏率 ${(humanCorrectionRate * 100).toFixed(1)}% 高于 15%`);
    if (memoryHitRate < 0.70) triggerReasons.push(`记忆命中率 ${(memoryHitRate * 100).toFixed(1)}% 低于 70%`);
    if (kpiDriftIndex > 0.20) triggerReasons.push(`KPI 漂移度 ${(kpiDriftIndex * 100).toFixed(1)}% 高于 20%`);
    if (overallScore < 60) triggerReasons.push(`健康综合评分 ${overallScore} 不及格`);
    
    const triggerDetail = triggerReasons.join("；");
    
    report.reportMd = `## Harness 评估触发报告\n\n评估触发原因：${triggerDetail}\n\n- 运行 ID: ${runId}\n- 综合评分: ${overallScore} 分\n- 异常项数: ${anomalies.length}`;

    // 写入提案触发审计日志
    await deps.writeAuditLog({
      actor: "system",
      action: "EvalProposalTriggered",
      targetType: "evaluation",
      targetId: runId,
      detail: `评估自动触发自演化升级提案生成。触发指征: ${triggerDetail}`,
      riskLevel: "medium",
      workspaceId,
    });

    try {
      await deps.generateProposal({
        ...report,
        workspaceId,
        metrics: {
          total: input.agentLogs?.length || 0,
          errors: Math.round((input.agentLogs?.length || 0) * (1 - workflowCompletionRate)),
          errorRate: 1 - workflowCompletionRate,
          successRate: workflowCompletionRate,
          windowHours: 24,
        },
      } as unknown);
    } catch (proposalError) {
      console.error("[evaluateHarnessRun] 联动生成升级提案失败", proposalError);
      await deps.writeAuditLog({
        actor: "system",
        action: "EvalProposalFailed",
        targetType: "evaluation",
        targetId: runId,
        detail: `联动提案生成器失败: ${proposalError instanceof Error ? proposalError.message : "未知错误"}`,
        riskLevel: "high",
        workspaceId,
      });
    }
  }

  // 6. 写入审计日志：评估完成
  await deps.writeAuditLog({
    actor: "system",
    action: "EvalCompleted",
    targetType: "evaluation",
    targetId: runId,
    detail: `Harness 评估完成，综合评分: ${overallScore} 分，触发升级提案: ${proposalEligible}`,
    riskLevel: "low",
    workspaceId,
  });

  return report;
}
