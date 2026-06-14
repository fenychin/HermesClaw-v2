/**
 * 外贸 Industry Pack 核心业务统计纯函数库
 * —— 提供高内聚、零 I/O 依赖的纯计算逻辑，便于单元测试。
 */
import { prisma } from "@/lib/prisma"


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

export interface ForeignTradeHealthDeps {
  prisma: typeof prisma;
}

const defaultDeps: ForeignTradeHealthDeps = {
  prisma,
};

/**
 * 依据 industryId 过滤并获取外贸相关的全部工作流健康指标及治理/演化日志数据
 */
export async function getForeignTradeHealthData(
  workspaceId: string,
  deps: ForeignTradeHealthDeps = defaultDeps,
) {
  // 1. 获取外贸相关的工作流定义 IDs
  const dbWorkflows = await deps.prisma.workflow.findMany({
    where: {
      workspaceId,
      industryId: "foreign-trade",
    },
    select: { id: true },
  })

  const dbWorkflowIds = dbWorkflows.map((w) => w.id)

  // 2. 查询最近 20 次外贸工作流运行记录
  const recentRuns = await deps.prisma.workflowRun.findMany({
    where: {
      workspaceId,
      workflowId: { in: dbWorkflowIds },
    },
    orderBy: { startedAt: "desc" },
    take: 20,
  })

  // 3. 计算健康指标
  const { successRate, errorRate, avgDurationMs, totalRuns } =
    calculateWorkflowHealth(recentRuns)

  // 4. 获取最近的节点运行状态与失败原因统计
  const runIds = recentRuns.map((r) => r.id)
  const nodeRuns = await deps.prisma.workflowNodeRun.findMany({
    where: {
      workspaceId,
      runId: { in: runIds },
    },
    orderBy: { finishedAt: "desc" },
    take: 50,
  })

  // 5. 获取针对外贸岗位的自演化日志
  const evolutionLogs = await deps.prisma.evolutionLog.findMany({
    where: { workspaceId },
    orderBy: { evaluatedAt: "desc" },
    take: 5,
  })

  // 6. 获取最近相关的治理事件审计日志
  const auditLogs = await deps.prisma.auditLog.findMany({
    where: {
      workspaceId,
      OR: [
        { action: { contains: "harness" } },
        { action: { contains: "proposal" } },
        { action: { contains: "workflow.node" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  return {
    successRate,
    errorRate,
    avgDurationMs,
    totalRuns,
    recentRuns,
    nodeRuns,
    evolutionLogs,
    auditLogs,
  }
}

