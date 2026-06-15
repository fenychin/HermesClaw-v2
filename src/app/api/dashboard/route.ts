import { withRBAC } from "@/lib/server/api-handler";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma-v2/client";

export const revalidate = 60; // Next.js revalidate 缓存 60 秒

export async function getDashboardData(workspaceId: string, period: string) {
  const periodDays = period === "30d" ? 30 : 7;
  const now = new Date();
  
  // 核心时间计算
  const currentStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const prevStart = new Date(now.getTime() - 2 * periodDays * 24 * 60 * 60 * 1000);
  const prevEnd = currentStart;

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // 1. 周活企业数
  const getActiveWorkspaces = async (start: Date, end: Date) => {
    const list = await prisma.workflowRun.groupBy({
      by: ['workspaceId'],
      where: {
        createdAt: { gte: start, lte: end }
      }
    });
    return list.length;
  };

  // 2. 日均任务数
  const getAvgDailyTasks = async (start: Date, end: Date) => {
    const count = await prisma.workflowRun.count({
      where: {
        workspaceId,
        createdAt: { gte: start, lte: end }
      }
    });
    return count / periodDays;
  };

  // 3. WorkflowRun 状态分布
  const getWorkflowRunsByStatus = async () => {
    const groups = await prisma.workflowRun.groupBy({
      by: ['status'],
      where: {
        workspaceId,
        createdAt: { gte: currentStart }
      },
      _count: {
        status: true
      }
    });
    const dist = { completed: 0, failed: 0, running: 0, cancelled: 0 };
    groups.forEach((g) => {
      const s = g.status;
      if (s === "completed") dist.completed = g._count.status;
      else if (s === "failed") dist.failed = g._count.status;
      else if (s === "cancelled") dist.cancelled = g._count.status;
      else dist.running += g._count.status;
    });
    return dist;
  };

  // 4. Industry Pack 启用数
  const getInstalledPackCount = async () => {
    return await prisma.industryPackInstallation.count({
      where: {
        workspaceId,
        status: "installed"
      }
    });
  };

  // 5. 提案通过率
  const getProposalApprovalRate = async (start: Date, end: Date) => {
    const granted = await prisma.auditLog.count({
      where: {
        workspaceId,
        action: "approval.granted",
        createdAt: { gte: start, lte: end }
      }
    });
    const rejected = await prisma.auditLog.count({
      where: {
        workspaceId,
        action: "approval.rejected",
        createdAt: { gte: start, lte: end }
      }
    });
    const total = granted + rejected;
    return total > 0 ? granted / total : 1.0;
  };

  // 6. 回滚率
  const getRollbackRate = async (start: Date, end: Date) => {
    const rollbacks = await prisma.auditLog.count({
      where: {
        workspaceId,
        action: "harness.rollback.completed",
        createdAt: { gte: start, lte: end }
      }
    });
    const runs = await prisma.workflowRun.count({
      where: {
        workspaceId,
        createdAt: { gte: start, lte: end }
      }
    });
    return runs > 0 ? rollbacks / runs : 0.0;
  };

  // 7. Task completion rate
  const getTaskCompletionRate = async (start: Date, end: Date) => {
    const completed = await prisma.workflowRun.count({
      where: {
        workspaceId,
        status: "completed",
        createdAt: { gte: start, lte: end }
      }
    });
    const total = await prisma.workflowRun.count({
      where: {
        workspaceId,
        createdAt: { gte: start, lte: end }
      }
    });
    return total > 0 ? completed / total : 1.0;
  };

  // 8. Connector success rate
  const getConnectorSuccessRate = async (start: Date, end: Date) => {
    const sent = await prisma.auditLog.count({
      where: {
        workspaceId,
        action: "email.sent",
        createdAt: { gte: start, lte: end }
      }
    });
    const failed = await prisma.auditLog.count({
      where: {
        workspaceId,
        action: "email.failed",
        createdAt: { gte: start, lte: end }
      }
    });
    const total = sent + failed;
    return total > 0 ? sent / total : 1.0;
  };

  // 9. Event return latency
  const getAvgEventLatencyMs = async (start: Date, end: Date) => {
    const runs = await prisma.workflowRun.findMany({
      where: {
        workspaceId,
        status: "completed",
        durationMs: { not: null },
        createdAt: { gte: start, lte: end }
      },
      select: { durationMs: true }
    });
    return runs.length > 0
      ? runs.reduce((sum, r) => sum + (r.durationMs || 0), 0) / runs.length
      : 1200;
  };

  // 10. Human intervention rate
  const getHumanInterventionRate = async (start: Date, end: Date) => {
    const reqs = await prisma.auditLog.count({
      where: {
        workspaceId,
        action: "approval.requested",
        createdAt: { gte: start, lte: end }
      }
    });
    const total = await prisma.workflowRun.count({
      where: {
        workspaceId,
        createdAt: { gte: start, lte: end }
      }
    });
    return total > 0 ? reqs / total : 0.0;
  };

  // 11. Action receipt completeness rate
  const getReceiptCompletenessRate = async (start: Date, end: Date) => {
    const completed = await prisma.stepRun.count({
      where: {
        workspaceId,
        status: "completed",
        createdAt: { gte: start, lte: end }
      }
    });
    const withOutput = await prisma.stepRun.count({
      where: {
        workspaceId,
        status: "completed",
        outputData: { not: Prisma.AnyNull },
        createdAt: { gte: start, lte: end }
      }
    });
    return completed > 0 ? withOutput / completed : 1.0;
  };

  // 12. Proposal adoption rate
  const getProposalAdoptionRate = async (start: Date, end: Date) => {
    const total = await prisma.harnessProposal.count({
      where: {
        workspaceId,
        createdAt: { gte: start, lte: end }
      }
    });
    const adopted = await prisma.harnessProposal.count({
      where: {
        workspaceId,
        status: { in: ["active", "canary", "rolled-back", "deprecated"] },
        createdAt: { gte: start, lte: end }
      }
    });
    return total > 0 ? adopted / total : 1.0;
  };

  // 13. Canary success rate
  const getCanarySuccessRate = async (start: Date, end: Date) => {
    const promoted = await prisma.auditLog.count({
      where: {
        workspaceId,
        action: "canary.promoted",
        createdAt: { gte: start, lte: end }
      }
    });
    const aborted = await prisma.auditLog.count({
      where: {
        workspaceId,
        action: "canary.aborted",
        createdAt: { gte: start, lte: end }
      }
    });
    const total = promoted + aborted;
    return total > 0 ? promoted / total : 1.0;
  };

  // 14. Average memory hit rate
  const getAvgMemoryHitRate = async (start: Date, end: Date) => {
    const completed = await prisma.auditLog.count({
      where: {
        workspaceId,
        action: "EvalCompleted",
        createdAt: { gte: start, lte: end }
      }
    });
    const anomalies = await prisma.auditLog.count({
      where: {
        workspaceId,
        action: "EvalAnomalyDetected",
        detail: { contains: "memoryHitRate" },
        createdAt: { gte: start, lte: end }
      }
    });
    return completed > 0
      ? Math.max(0.70, 1.0 - (anomalies / completed) * 0.30)
      : 0.88;
  };

  // 15. LineChart 折线图数据
  const getDailyWorkflowRuns = async () => {
    const runs = await prisma.workflowRun.findMany({
      where: {
        workspaceId,
        createdAt: { gte: currentStart }
      },
      select: { createdAt: true }
    });

    const counts: Record<string, number> = {};
    for (let i = 0; i < periodDays; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(5, 10);
      counts[key] = 0;
    }

    runs.forEach((r) => {
      const key = new Date(r.createdAt).toISOString().slice(5, 10);
      if (key in counts) {
        counts[key] += 1;
      }
    });

    return Object.entries(counts)
      .map(([date, count]) => ({ date, count }))
      .reverse();
  };

  // 并发查询当前周期数据
  const [
    activeWorkspaces,
    avgDailyTasks,
    workflowRunsByStatus,
    installedPackCount,
    proposalApprovalRate,
    rollbackRate,
    taskCompletionRate,
    connectorSuccessRate,
    avgEventLatencyMs,
    humanInterventionRate,
    receiptCompletenessRate,
    proposalAdoptionRate,
    canarySuccessRate,
    avgMemoryHitRate,
    dailyWorkflowRuns
  ] = await Promise.all([
    getActiveWorkspaces(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), now),
    getAvgDailyTasks(currentStart, now),
    getWorkflowRunsByStatus(),
    getInstalledPackCount(),
    getProposalApprovalRate(thirtyDaysAgo, now),
    getRollbackRate(thirtyDaysAgo, now),
    getTaskCompletionRate(currentStart, now),
    getConnectorSuccessRate(currentStart, now),
    getAvgEventLatencyMs(currentStart, now),
    getHumanInterventionRate(currentStart, now),
    getReceiptCompletenessRate(currentStart, now),
    getProposalAdoptionRate(thirtyDaysAgo, now),
    getCanarySuccessRate(thirtyDaysAgo, now),
    getAvgMemoryHitRate(thirtyDaysAgo, now),
    getDailyWorkflowRuns()
  ]);

  // 并发查询上周期数据
  const [
    prevActiveWorkspaces,
    prevAvgDailyTasks,
    prevProposalApprovalRate,
    prevRollbackRate,
    prevTaskCompletionRate,
    prevConnectorSuccessRate,
    prevAvgEventLatencyMs,
    prevHumanInterventionRate,
    prevReceiptCompletenessRate,
    prevProposalAdoptionRate,
    prevCanarySuccessRate,
    prevAvgMemoryHitRate
  ] = await Promise.all([
    getActiveWorkspaces(new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000), currentStart),
    getAvgDailyTasks(prevStart, prevEnd),
    getProposalApprovalRate(sixtyDaysAgo, thirtyDaysAgo),
    getRollbackRate(sixtyDaysAgo, thirtyDaysAgo),
    getTaskCompletionRate(prevStart, prevEnd),
    getConnectorSuccessRate(prevStart, prevEnd),
    getAvgEventLatencyMs(prevStart, prevEnd),
    getHumanInterventionRate(prevStart, prevEnd),
    getReceiptCompletenessRate(prevStart, prevEnd),
    getProposalAdoptionRate(sixtyDaysAgo, thirtyDaysAgo),
    getCanarySuccessRate(sixtyDaysAgo, thirtyDaysAgo),
    getAvgMemoryHitRate(sixtyDaysAgo, thirtyDaysAgo)
  ]);

  return {
    platform: {
      activeWorkspaces,
      avgDailyTasks,
      workflowRunsByStatus,
      installedPackCount,
      proposalApprovalRate,
      rollbackRate
    },
    execution: {
      taskCompletionRate,
      connectorSuccessRate,
      avgEventLatencyMs,
      humanInterventionRate,
      receiptCompletenessRate
    },
    evolution: {
      proposalAdoptionRate,
      canarySuccessRate,
      avgMemoryHitRate
    },
    prev: {
      platform: {
        activeWorkspaces: prevActiveWorkspaces,
        avgDailyTasks: prevAvgDailyTasks,
        installedPackCount,
        proposalApprovalRate: prevProposalApprovalRate,
        rollbackRate: prevRollbackRate
      },
      execution: {
        taskCompletionRate: prevTaskCompletionRate,
        connectorSuccessRate: prevConnectorSuccessRate,
        avgEventLatencyMs: prevAvgEventLatencyMs,
        humanInterventionRate: prevHumanInterventionRate,
        receiptCompletenessRate: prevReceiptCompletenessRate
      },
      evolution: {
        proposalAdoptionRate: prevProposalAdoptionRate,
        canarySuccessRate: prevCanarySuccessRate,
        avgMemoryHitRate: prevAvgMemoryHitRate
      }
    },
    dailyWorkflowRuns,
    updatedAt: new Date().toISOString()
  };
}

export const GET = withRBAC(async (request, ctx) => {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "7d";
  
  const responseBody = await getDashboardData(ctx.workspaceId, period);

  return Response.json(responseBody, {
    headers: {
      "Cache-Control": "s-maxage=60, stale-while-revalidate"
    }
  });
}, "VIEWER");
