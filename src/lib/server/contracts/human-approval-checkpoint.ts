import type { AutomationLevel, RiskLevel } from './task-envelope';

export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'expired' | 'auto-approved';

export type ApprovalTriggerReason =
  | 'risk.level.high'
  | 'risk.level.critical'
  | 'automation.level.l3_l4'
  | 'irreversible.action'
  | 'eval.proposal.generated'
  | 'canary.activation'
  | 'manual.escalation';

export interface HumanApprovalCheckpoint {
  checkpointId: string;
  taskId?: string;              // 与任务关联（可选，提案审批时可无 taskId）
  workflowRunId?: string;
  proposalId?: string;          // 与提案关联（可选）
  workspaceId: string;
  decision: ApprovalDecision;
  triggerReason: ApprovalTriggerReason;
  requestedAt: Date;
  decidedAt?: Date;
  decidedBy?: string;           // 审批人 userId
  expiresAt: Date;              // 超时自动拒绝
  riskLevel: RiskLevel;
  automationLevel: AutomationLevel;
  actionSummary: string;        // 给审批人的人类可读摘要
  inputSnapshot: Record<string, unknown>;  // 审批时的完整输入快照
  policySnapshotVersion: string;
}

// 超时判断（expiresAt 已过且仍为 pending 则视为 expired）
export function isCheckpointExpired(checkpoint: HumanApprovalCheckpoint): boolean {
  return checkpoint.decision === 'pending' && new Date() > new Date(checkpoint.expiresAt);
}
