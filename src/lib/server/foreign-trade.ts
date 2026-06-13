/**
 * 外贸 Industry Pack 核心业务统计纯函数库
 * —— 提供高内聚、零 I/O 依赖的纯计算逻辑，便于单元测试。
 */

export interface WorkflowRunSummary {
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface WorkflowHealthStats {
  successRate: number;
  errorRate: number;
  avgDurationMs: number;
  totalRuns: number;
}

/**
 * 依据最近运行记录计算健康度指标（成功率、错误率、平均用时）
 * 
 * @param runs 最近的工作流运行记录
 * @returns 聚合的健康指标
 */
export function calculateWorkflowHealth(runs: WorkflowRunSummary[]): WorkflowHealthStats {
  const totalRuns = runs.length;
  if (totalRuns === 0) {
    return {
      successRate: 1,
      errorRate: 0,
      avgDurationMs: 0,
      totalRuns: 0,
    };
  }

  const completedRuns = runs.filter((r) => r.status === "completed");
  const failedRuns = runs.filter((r) => r.status === "failed");
  const successRate = completedRuns.length / totalRuns;
  const errorRate = failedRuns.length / totalRuns;

  let totalDurationMs = 0;
  let validDurationCount = 0;

  for (const run of runs) {
    if (run.finishedAt && run.startedAt) {
      const dur = run.finishedAt.getTime() - run.startedAt.getTime();
      // 过滤异常负数和超过一天的异常长耗时
      if (dur >= 0 && dur < 86400000) {
        totalDurationMs += dur;
        validDurationCount++;
      }
    }
  }

  const avgDurationMs =
    validDurationCount > 0 ? Math.round(totalDurationMs / validDurationCount) : 0;

  return {
    successRate,
    errorRate,
    avgDurationMs,
    totalRuns,
  };
}
