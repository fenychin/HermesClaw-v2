/**
 * Harness Lifecycle — 提案状态机转换纯函数
 *
 * 三域归属：Hermes Control Kernel
 * 设计原则：纯函数，不依赖 HTTP 层和 Prisma 实例
 */

// ==============================
// 类型定义
// ==============================

export type HarnessProposalStatus =
  | "draft"
  | "pending"
  | "approved"
  | "canary"
  | "active"
  | "rejected"
  | "rolled_back";

export interface CanaryMetrics {
  workflowSuccessRate: number;
  connectorSuccessRate: number;
  humanApprovalRate: number;
  totalRuns: number;
}

export interface CanaryThresholds {
  /** 工作流成功率基线（用于 shouldPromoteCanary 判定） */
  workflowSuccessRate: number;
  /** 连接器成功率基线（用于 shouldPromoteCanary 判定） */
  connectorSuccessRate: number;
  /** 晋级所需最低成功率 (successRate > promotionSuccessRate) */
  promotionSuccessRate: number;
  /** 晋级所需最高错误率 (errorRate < promotionErrorRate) */
  promotionErrorRate: number;
  /** 自动中止/回滚的错误率红线 (errorRate > abortErrorRate → 紧急中止) */
  abortErrorRate: number;
  /** 默认观察窗口时长 (ms)，默认 24h */
  observationWindowMs: number;
}

/**
 * Canary 评估唯一阈值源（AGENTS.md §3.5 Canary 唯一阈值源约定）
 *
 * 所有 Canary 晋级/回滚/中止的阈值必须统一派生自此对象。
 * 严禁在 apps/ 业务侧或 Cron 定时任务中私自硬编码任何数值。
 */
export const DEFAULT_CANARY_THRESHOLDS: CanaryThresholds = {
  workflowSuccessRate: 0.8,
  connectorSuccessRate: 0.85,
  promotionSuccessRate: 0.90,
  promotionErrorRate: 0.05,
  abortErrorRate: 0.20,
  observationWindowMs: 24 * 60 * 60 * 1000, // 86400000 ms
};

// ==============================
// 状态转换矩阵
// ==============================

type TransitionMap = Record<HarnessProposalStatus, HarnessProposalStatus[]>;

const VALID_TRANSITIONS: TransitionMap = {
  draft: ["pending"],
  pending: ["approved", "rejected"],
  approved: ["canary", "rejected"],
  canary: ["active", "rolled_back"],
  active: ["rolled_back"],
  rejected: [],
  rolled_back: [],
};

export function canTransition(
  from: HarnessProposalStatus,
  to: HarnessProposalStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ==============================
// Canary 指标计算（需 Prisma）
// ==============================

export async function computeCanaryMetrics(
  prisma: any,
  workspaceId: string,
  since: Date,
): Promise<CanaryMetrics> {
  const metrics: CanaryMetrics = {
    workflowSuccessRate: 1,
    connectorSuccessRate: 1,
    humanApprovalRate: 1,
    totalRuns: 0,
  };

  // WorkflowRun 统计
  try {
    const [totalWf, failedWf] = await Promise.all([
      prisma.workflowRun.count({
        where: {
          workspaceId,
          createdAt: { gte: since },
          status: { in: ["completed", "failed"] },
        },
      }),
      prisma.workflowRun.count({
        where: {
          workspaceId,
          createdAt: { gte: since },
          status: "failed",
        },
      }),
    ]);
    metrics.totalRuns += totalWf;
    metrics.workflowSuccessRate = totalWf > 0 ? (totalWf - failedWf) / totalWf : 1;
  } catch {
    /* table may not exist */
  }

  // Connector 调用统计（connectorLog 表或 EmailSendLog）
  try {
    if (prisma.emailSendLog?.count) {
      const [totalConn, failedConn] = await Promise.all([
        prisma.emailSendLog.count({
          where: {
            workspaceId,
            createdAt: { gte: since },
            status: { in: ["sent", "failed", "bounced"] },
          },
        }),
        prisma.emailSendLog.count({
          where: {
            workspaceId,
            createdAt: { gte: since },
            status: { in: ["failed", "bounced"] },
          },
        }),
      ]);
      metrics.totalRuns += totalConn;
      metrics.connectorSuccessRate = totalConn > 0 ? (totalConn - failedConn) / totalConn : 1;
    }
  } catch {
    /* table may not exist */
  }

  // Human approval rate（人工审批通过的比率）
  try {
    if (prisma.approvalCheckpoint?.count) {
      const [totalApproval, rejectedApproval] = await Promise.all([
        prisma.approvalCheckpoint.count({
          where: {
            workspaceId,
            createdAt: { gte: since },
            decision: { in: ["approved", "rejected", "auto-approved"] },
          },
        }),
        prisma.approvalCheckpoint.count({
          where: {
            workspaceId,
            createdAt: { gte: since },
            decision: "rejected",
          },
        }),
      ]);
      metrics.totalRuns += totalApproval;
      metrics.humanApprovalRate =
        totalApproval > 0 ? (totalApproval - rejectedApproval) / totalApproval : 1;
    }
  } catch {
    /* table may not exist */
  }

  return metrics;
}

// ==============================
// 晋级判定
// ==============================

export function shouldPromoteCanary(
  metrics: CanaryMetrics,
  thresholds: CanaryThresholds = DEFAULT_CANARY_THRESHOLDS,
): boolean {
  return (
    metrics.workflowSuccessRate >= thresholds.workflowSuccessRate &&
    metrics.connectorSuccessRate >= thresholds.connectorSuccessRate
  );
}
