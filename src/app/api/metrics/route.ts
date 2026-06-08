import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * GET /api/metrics
 * 返回平台核心业务指标，用于监控大盘与告警
 * —— 供内部监控系统（如 Grafana / Datadog）消费
 */
export async function GET() {
  try {
    const [
      agentCount,
      runningAgents,
      errorAgents,
      projectCount,
      pendingProposals,
      totalLogs,
      errorLogs,
      conversationCount,
    ] = await Promise.all([
      prisma.agent.count(),
      prisma.agent.count({ where: { status: 'running' } }),
      prisma.agent.count({ where: { status: 'error' } }),
      prisma.project.count(),
      prisma.harnessProposal.count({ where: { status: 'pending' } }),
      prisma.agentLog.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      prisma.agentLog.count({
        where: {
          status: 'error',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.conversation.count(),
    ]);

    return Response.json({
      timestamp: new Date().toISOString(),
      agents: { total: agentCount, running: runningAgents, error: errorAgents },
      projects: { total: projectCount },
      harness: { pendingProposals },
      logs24h: {
        total: totalLogs,
        errors: errorLogs,
        errorRate: totalLogs > 0 ? (errorLogs / totalLogs * 100).toFixed(1) + '%' : '0%',
      },
      conversations: { total: conversationCount },
    });
  } catch (error) {
    logger.error('获取业务指标失败', {
      error: error instanceof Error ? error.message : '未知错误',
    });
    return Response.json(
      { error: '获取指标失败', timestamp: new Date().toISOString() },
      { status: 500 },
    );
  }
}

/**
 * 指标路由缓存策略：禁用缓存，确保每次返回最新数据
 */
export const dynamic = 'force-dynamic';
