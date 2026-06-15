import { describe, it, expect, vi, beforeEach } from 'vitest';

// 必须在任何业务代码导入前 Mock，切断 Anthropic / Next.js/Auth 的级联加载链
vi.mock("@/lib/server/harness/orchestrator", () => ({
  runHarnessEvaluation: vi.fn(),
}));
vi.mock("@/lib/server/harness/metrics", () => ({
  EVAL_WINDOW_HOURS: 24,
  isTrendingUp: vi.fn(),
  isErrorStatus: vi.fn(),
  buildLogSummary: vi.fn(),
  computeMetrics: vi.fn(),
}));
vi.mock("@/lib/server/harness/report-builder", () => ({
  buildEvaluationReport: vi.fn(),
}));

import { evaluateHarnessRun, type EvalInput } from '../harness-eval';

describe('Harness Evaluation Engine Unit Tests', () => {
  // Mock 依赖项
  const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
  const mockGenerateProposal = vi.fn().mockResolvedValue({});

  const mockDeps = {
    writeAuditLog: mockWriteAuditLog,
    generateProposal: mockGenerateProposal,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正常执行：指标全部优良，不触发自演化提案', async () => {
    const input: EvalInput = {
      workflowRunId: 'run-good-001',
      agentLogs: [
        { id: 'log-1', status: 'completed' },
        { id: 'log-2', status: 'completed' },
      ],
      auditEvents: [],
      connectorResults: [
        { connectorId: 'c-1', success: true },
        { connectorId: 'c-2', success: true },
      ],
      humanCorrections: [
        { runId: 'run-good-001', correctionMade: false }
      ],
      memoryMissEvents: [
        { key: 'm-1', missed: false }
      ],
      industryKpiSnapshot: {
        actualSuccessRate: 0.95,
        actualAvgDurationMs: 4800,
      }
    };

    const report = await evaluateHarnessRun(input, 'test-workspace', mockDeps);

    expect(report.runId).toBe('run-good-001');
    expect(report.overallScore).toBeGreaterThanOrEqual(90);
    expect(report.proposalEligible).toBe(false);
    expect(report.anomalies.length).toBe(0);
    
    // 应该只写入 EvalStarted 和 EvalCompleted 日志，没有 Anomaly 和 ProposalTriggered
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(2);
    expect(mockWriteAuditLog.mock.calls[0][0].action).toBe('EvalStarted');
    expect(mockWriteAuditLog.mock.calls[1][0].action).toBe('EvalCompleted');
    expect(mockGenerateProposal).not.toHaveBeenCalled();
  });

  it('异常执行：Connector 成功率低 (< 0.85)，触发自演化提案', async () => {
    const input: EvalInput = {
      workflowRunId: 'run-conn-fail',
      agentLogs: [{ id: 'log-1', status: 'completed' }],
      auditEvents: [],
      connectorResults: [
        { connectorId: 'c-1', success: true },
        { connectorId: 'c-2', success: false }, // 50% 成功率，低于 85%
      ],
      humanCorrections: [],
      memoryMissEvents: [],
      industryKpiSnapshot: {
        actualSuccessRate: 0.90,
        actualAvgDurationMs: 5000,
      }
    };

    const report = await evaluateHarnessRun(input, 'test-workspace', mockDeps);

    expect(report.proposalEligible).toBe(true);
    expect(report.dimensions.connectorSuccessRate).toBe(0.5);
    
    // 包含一个连接器异常
    const connectorAnomaly = report.anomalies.find(a => a.dimension === 'connectorSuccessRate');
    expect(connectorAnomaly).toBeDefined();
    
    // 校验审计留痕
    const auditActions = mockWriteAuditLog.mock.calls.map(call => call[0].action);
    expect(auditActions).toContain('EvalAnomalyDetected');
    expect(auditActions).toContain('EvalProposalTriggered');
    
    // 验证调用了 proposal-engine
    expect(mockGenerateProposal).toHaveBeenCalled();
  });

  it('异常执行：人工纠正率超标 (> 0.15)，触发自演化提案', async () => {
    const input: EvalInput = {
      workflowRunId: 'run-human-correct',
      agentLogs: [{ id: 'log-1', status: 'completed' }],
      auditEvents: [],
      connectorResults: [],
      humanCorrections: [
        { runId: 'run-human-correct', correctionMade: true }, // 100% 纠正率
      ],
      memoryMissEvents: [],
      industryKpiSnapshot: {
        actualSuccessRate: 0.90,
        actualAvgDurationMs: 5000,
      }
    };

    const report = await evaluateHarnessRun(input, 'test-workspace', mockDeps);

    expect(report.proposalEligible).toBe(true);
    expect(report.dimensions.humanCorrectionRate).toBe(1.0);
    
    const anomaly = report.anomalies.find(a => a.dimension === 'humanCorrectionRate');
    expect(anomaly).toBeDefined();
    expect(mockGenerateProposal).toHaveBeenCalled();
  });

  it('异常执行：KPI 偏差及综合分过低 (< 60)，触发自演化提案', async () => {
    const input: EvalInput = {
      workflowRunId: 'run-low-score',
      agentLogs: [
        { id: 'log-1', status: 'failed' },
        { id: 'log-2', status: 'failed' }, // 完成率低
      ],
      auditEvents: [],
      connectorResults: [
        { connectorId: 'c-1', success: false } // 成功率低
      ],
      humanCorrections: [],
      memoryMissEvents: [],
      industryKpiSnapshot: {
        actualSuccessRate: 0.50, // KPI 大幅偏移 (成功率只有 50%)
        actualAvgDurationMs: 12000, // 耗时严重超标
      }
    };

    const report = await evaluateHarnessRun(input, 'test-workspace', mockDeps);

    expect(report.overallScore).toBeLessThan(60);
    expect(report.proposalEligible).toBe(true);
    expect(mockGenerateProposal).toHaveBeenCalled();
  });

  it('空集/冷启动输入：不崩溃且能优雅降级，返还满分达标状态', async () => {
    const input: EvalInput = {
      workflowRunId: '',
      agentLogs: [],
      auditEvents: [],
      connectorResults: [],
      humanCorrections: [],
      memoryMissEvents: [],
      industryKpiSnapshot: {
        actualSuccessRate: 0.90,
        actualAvgDurationMs: 5000,
      }
    };

    const report = await evaluateHarnessRun(input, 'test-workspace', mockDeps);

    expect(report.runId).toBeDefined();
    expect(report.overallScore).toBe(100); // 冷启动默认为满分状态
    expect(report.proposalEligible).toBe(false);
    expect(report.anomalies.length).toBe(0);
    expect(mockGenerateProposal).not.toHaveBeenCalled();
  });
});
