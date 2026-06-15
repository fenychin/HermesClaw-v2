import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma-v2/client";
import { isCheckpointExpired } from "./contracts/human-approval-checkpoint";
import type {
  HumanApprovalCheckpoint,
  ApprovalDecision,
  ApprovalTriggerReason,
} from "./contracts/human-approval-checkpoint";
import type { RiskLevel, AutomationLevel } from "./contracts/task-envelope";

// 超时时间顶层常量（AGENTS.md / 硬约束要求不得硬编码）
export const PROPOSAL_APPROVAL_EXPIRY_MS = 72 * 60 * 60 * 1000; // 72 小时
export const HIGH_RISK_ACTION_APPROVAL_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 小时
// 顶层常量：风险等级到审计风险等级的映射（去除重复逻辑）
export const RISK_LEVEL_MAP: Record<string, 'low' | 'medium' | 'high'> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'high',
};

export interface AuditInput {
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  detail?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  workspaceId: string;
  contextSnapshot?: Record<string, unknown>;
}

export interface ApprovalDeps {
  writeAuditLog: (input: AuditInput) => Promise<void>;
  // P1-B 实现：提案执行放行后调用 canary 灰度
  triggerCanary?: (proposalId: string) => Promise<void>;
  // P1-A 实现：approval 通过后立即触发快照
  recordProposalSnapshot?: (proposalId: string) => Promise<void>;
}

const defaultDeps: ApprovalDeps = {
  writeAuditLog: async (input) => {
    const { writeAuditLog } = await import("./audit");
    await writeAuditLog(input);
  },
};

// ==============================
// 异常类型定义
// ==============================

export class ApprovalNotFoundError extends Error {
  constructor(checkpointId: string) {
    super(`ApprovalCheckpoint not found: ${checkpointId}`);
    this.name = 'ApprovalNotFoundError';
  }
}

export class ApprovalAlreadyDecidedError extends Error {
  constructor(checkpointId: string, currentDecision: string) {
    super(`ApprovalCheckpoint ${checkpointId} already decided: ${currentDecision}`);
    this.name = 'ApprovalAlreadyDecidedError';
  }
}

export class ApprovalExpiredError extends Error {
  constructor(checkpointId: string) {
    super(`ApprovalCheckpoint ${checkpointId} has expired`);
    this.name = 'ApprovalExpiredError';
  }
}

export class UnauthorizedSignerError extends Error {
  constructor(checkpointId: string, signer: string) {
    super(`Signer ${signer} is not authorized for checkpoint ${checkpointId}`);
    this.name = 'UnauthorizedSignerError';
  }
}

// ==============================
// 辅助类型转换函数
// ==============================

interface DbApprovalCheckpoint {
  checkpointId: string;
  taskId?: string | null;
  workflowRunId?: string | null;
  proposalId?: string | null;
  workspaceId: string;
  decision: string;
  triggerReason: string;
  requestedAt: Date;
  decidedAt?: Date | null;
  decidedBy?: string | null;
  expiresAt: Date;
  riskLevel: string;
  automationLevel: string;
  actionSummary: string;
  inputSnapshot: unknown;
  policySnapshotVersion: string;
  requiredSigners?: string | null;
  signedList?: string | null;
}

function mapDbToCheckpoint(dbRecord: DbApprovalCheckpoint): HumanApprovalCheckpoint {
  let requiredSigners: string[] | undefined = undefined;
  let signedList: string[] | undefined = undefined;
  try {
    if (dbRecord.requiredSigners) {
      requiredSigners = JSON.parse(dbRecord.requiredSigners);
    }
    if (dbRecord.signedList) {
      signedList = JSON.parse(dbRecord.signedList);
    }
  } catch {}

  return {
    checkpointId: dbRecord.checkpointId,
    taskId: dbRecord.taskId ?? undefined,
    workflowRunId: dbRecord.workflowRunId ?? undefined,
    proposalId: dbRecord.proposalId ?? undefined,
    workspaceId: dbRecord.workspaceId,
    decision: dbRecord.decision as ApprovalDecision,
    triggerReason: dbRecord.triggerReason as ApprovalTriggerReason,
    requestedAt: dbRecord.requestedAt,
    decidedAt: dbRecord.decidedAt ?? undefined,
    decidedBy: dbRecord.decidedBy ?? undefined,
    expiresAt: dbRecord.expiresAt,
    riskLevel: dbRecord.riskLevel as RiskLevel,
    automationLevel: dbRecord.automationLevel as AutomationLevel,
    actionSummary: dbRecord.actionSummary,
    inputSnapshot: dbRecord.inputSnapshot as Record<string, unknown>,
    policySnapshotVersion: dbRecord.policySnapshotVersion,
    requiredSigners,
    signedList,
  };
}

// ==============================
// 核心审批函数实现
// ==============================

export interface CreateApprovalCheckpointInput extends Omit<HumanApprovalCheckpoint, 'checkpointId' | 'requestedAt' | 'decision'> {
  creator?: string;
}

/**
 * 创建人工审批检查点
 */
export async function createApprovalCheckpoint(
  input: CreateApprovalCheckpointInput,
  deps?: ApprovalDeps
): Promise<HumanApprovalCheckpoint> {
  const activeDeps = { ...defaultDeps, ...deps };
  
  // 支持在 input 中传递自定义的 checkpointId，方便幂等查重
  const checkpointId = (input as any).checkpointId || `acp-${crypto.randomUUID()}`;

  // 0. 幂等查重：若 checkpointId 已存在且匹配，则直接返回
  const existing = await prisma.approvalCheckpoint.findUnique({
    where: { checkpointId }
  });
  if (existing) {
    return mapDbToCheckpoint(existing);
  }

  // 1. 写入数据库记录
  const dbRecord = await prisma.approvalCheckpoint.create({
    data: {
      checkpointId,
      workspaceId: input.workspaceId,
      taskId: input.taskId ?? null,
      workflowRunId: input.workflowRunId ?? null,
      proposalId: input.proposalId ?? null,
      decision: 'pending',
      triggerReason: input.triggerReason,
      riskLevel: input.riskLevel,
      automationLevel: input.automationLevel,
      actionSummary: input.actionSummary,
      inputSnapshot: input.inputSnapshot as Prisma.InputJsonValue,
      policySnapshotVersion: input.policySnapshotVersion,
      expiresAt: input.expiresAt,
      requiredSigners: input.requiredSigners ? JSON.stringify(input.requiredSigners) : null,
      signedList: input.requiredSigners ? JSON.stringify([]) : null,
    },
  });

  // 2. 写入审计日志 (action: 'approval.requested')
  await activeDeps.writeAuditLog({
    actor: input.creator || 'system',
    action: 'approval.requested',
    targetType: 'approval',
    targetId: checkpointId,
    detail: input.actionSummary,
    riskLevel: RISK_LEVEL_MAP[input.riskLevel] || 'medium',
    workspaceId: input.workspaceId,
    contextSnapshot: { checkpointId, riskLevel: input.riskLevel, actionType: input.actionSummary }
  });

  return mapDbToCheckpoint(dbRecord);
}

/**
 * 审批人做出决策
 */
export async function decideApprovalCheckpoint(
  checkpointId: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
  reasonOrDeps?: string | ApprovalDeps,
  deps?: ApprovalDeps
): Promise<HumanApprovalCheckpoint> {
  let reason: string | undefined = undefined;
  let activeDeps = defaultDeps;
  if (typeof reasonOrDeps === 'string') {
    reason = reasonOrDeps;
    if (deps) activeDeps = { ...defaultDeps, ...deps };
  } else if (reasonOrDeps && typeof reasonOrDeps === 'object') {
    activeDeps = { ...defaultDeps, ...reasonOrDeps };
  } else if (deps) {
    // reasonOrDeps 为 undefined，但第 5 参数 deps 仍然存在（如全票通过测试注入 hooks）
    activeDeps = { ...defaultDeps, ...deps };
  }

  // 1. 查询是否存在
  const record = await prisma.approvalCheckpoint.findUnique({
    where: { checkpointId },
  });

  if (!record) {
    throw new ApprovalNotFoundError(checkpointId);
  }

  // 2. 检查是否已经是已决状态
  if (record.decision !== 'pending') {
    if (record.decision === decision) {
      // 决策相同，幂等成功，直接返回，不抛错
      return mapDbToCheckpoint(record);
    }
    throw new ApprovalAlreadyDecidedError(checkpointId, record.decision);
  }

  // 3. 检查是否超时失效
  const checkpoint = mapDbToCheckpoint(record);
  if (isCheckpointExpired(checkpoint)) {
    // 更新为 expired 状态
    await prisma.approvalCheckpoint.update({
      where: { checkpointId },
      data: { decision: 'expired' },
    });

    await activeDeps.writeAuditLog({
      actor: 'system',
      action: 'approval.expired',
      targetType: 'approval',
      targetId: checkpointId,
      detail: `审批超时失效，已拒绝该审批决策: ${checkpoint.actionSummary}`,
      riskLevel: RISK_LEVEL_MAP[checkpoint.riskLevel] || 'medium',
      workspaceId: checkpoint.workspaceId,
    });

    throw new ApprovalExpiredError(checkpointId);
  }

  // 3.5 多签越权检查
  const requiredList: string[] = checkpoint.requiredSigners || [];
  const signed: string[] = checkpoint.signedList || [];
  if (requiredList.length > 0) {
    if (!requiredList.includes(decidedBy)) {
      throw new UnauthorizedSignerError(checkpointId, decidedBy);
    }
  }

  // 4. 一票否决分支：拒绝 (rejected) 直接终止
  if (decision === 'rejected') {
    const updatedRecord = await prisma.approvalCheckpoint.update({
      where: { checkpointId },
      data: {
        decision: 'rejected',
        decidedAt: new Date(),
        decidedBy,
      },
    });

    await activeDeps.writeAuditLog({
      actor: decidedBy,
      action: 'approval.rejected',
      targetType: 'approval',
      targetId: checkpointId,
      detail: `审批决策: [rejected]。${reason ? `拒绝原因: ${reason}。` : ''}审批摘要: ${checkpoint.actionSummary}`,
      riskLevel: RISK_LEVEL_MAP[checkpoint.riskLevel] || 'medium',
      workspaceId: checkpoint.workspaceId,
      contextSnapshot: { checkpointId, decidedBy, reason }
    });

    return mapDbToCheckpoint(updatedRecord);
  }

  // 5. 同意分支 (approved)
  if (requiredList.length > 0) {
    // 多人串联审批流
    if (signed.includes(decidedBy)) {
      return checkpoint; // 已经签过字，直接幂等返回
    }

    const newSigned = [...signed, decidedBy];
    const allApproved = requiredList.every((signer) => newSigned.includes(signer));

    if (allApproved) {
      // 所有人已全部同意 → 完成决策
      const updatedRecord = await prisma.approvalCheckpoint.update({
        where: { checkpointId },
        data: {
          decision: 'approved',
          decidedAt: new Date(),
          decidedBy,
          signedList: JSON.stringify(newSigned),
        },
      });

      await activeDeps.writeAuditLog({
        actor: decidedBy,
        action: 'approval.granted',
        targetType: 'approval',
        targetId: checkpointId,
        detail: `审批决策: [approved] (多人全票通过)。审批摘要: ${checkpoint.actionSummary}`,
        riskLevel: RISK_LEVEL_MAP[checkpoint.riskLevel] || 'medium',
        workspaceId: checkpoint.workspaceId,
        contextSnapshot: { checkpointId, decidedBy, requiredSigners: requiredList, signedList: newSigned }
      });

      // 触发快照与 canary 灰度
      if (updatedRecord.proposalId) {
        if (activeDeps.recordProposalSnapshot) {
          await activeDeps.recordProposalSnapshot(updatedRecord.proposalId);
        }
        if (activeDeps.triggerCanary) {
          await activeDeps.triggerCanary(updatedRecord.proposalId);
        }
      }

      return mapDbToCheckpoint(updatedRecord);
    } else {
      // 还有人未签名 → 记录当前签名，保持 pending 状态
      const updatedRecord = await prisma.approvalCheckpoint.update({
        where: { checkpointId },
        data: {
          signedList: JSON.stringify(newSigned),
        },
      });

      await activeDeps.writeAuditLog({
        actor: decidedBy,
        action: 'approval.signed',
        targetType: 'approval',
        targetId: checkpointId,
        detail: `审批人 ${decidedBy} 已签字同意，当前进度: [${newSigned.length}/${requiredList.length}]，等待其他人审批。`,
        riskLevel: RISK_LEVEL_MAP[checkpoint.riskLevel] || 'medium',
        workspaceId: checkpoint.workspaceId,
        contextSnapshot: { checkpointId, decidedBy, requiredSigners: requiredList, signedList: newSigned }
      });

      return mapDbToCheckpoint(updatedRecord);
    }
  } else {
    // 经典单人一键审批
    const updatedRecord = await prisma.approvalCheckpoint.update({
      where: { checkpointId },
      data: {
        decision: 'approved',
        decidedAt: new Date(),
        decidedBy,
      },
    });

    await activeDeps.writeAuditLog({
      actor: decidedBy,
      action: 'approval.granted',
      targetType: 'approval',
      targetId: checkpointId,
      detail: `审批决策: [approved]。审批摘要: ${checkpoint.actionSummary}`,
      riskLevel: RISK_LEVEL_MAP[checkpoint.riskLevel] || 'medium',
      workspaceId: checkpoint.workspaceId,
      contextSnapshot: { checkpointId, decidedBy }
    });

    // 触发快照与 canary 灰度
    if (updatedRecord.proposalId) {
      if (activeDeps.recordProposalSnapshot) {
        await activeDeps.recordProposalSnapshot(updatedRecord.proposalId);
      }
      if (activeDeps.triggerCanary) {
        await activeDeps.triggerCanary(updatedRecord.proposalId);
      }
    }

    return mapDbToCheckpoint(updatedRecord);
  }
}

/**
 * 批量过期超时未处理的 checkpoint
 */
export async function expireStaleCheckpoints(
  workspaceId?: string,
  deps?: ApprovalDeps
): Promise<{ expired: number }> {
  const activeDeps = { ...defaultDeps, ...deps };
  const now = new Date();

  // 1. 查询所有 pending 且已超时的记录
  const staleRecords = await prisma.approvalCheckpoint.findMany({
    where: {
      decision: 'pending',
      expiresAt: { lt: now },
      ...(workspaceId ? { workspaceId } : {}),
    },
  });

  if (staleRecords.length === 0) {
    return { expired: 0 };
  }

  const ids = staleRecords.map((r) => r.checkpointId);

  // 2. 批量更新为 expired
  await prisma.approvalCheckpoint.updateMany({
    where: { checkpointId: { in: ids } },
    data: { decision: 'expired' },
  });

  // 3. 写入审计日志
  for (const record of staleRecords) {
    await activeDeps.writeAuditLog({
      actor: 'system',
      action: 'approval.expired',
      targetType: 'approval',
      targetId: record.checkpointId,
      detail: `超时未审批，自动失效拒绝: ${record.actionSummary}`,
      riskLevel: RISK_LEVEL_MAP[record.riskLevel] || 'medium',
      workspaceId: record.workspaceId,
    });
  }

  return { expired: staleRecords.length };
}

/**
 * 读取单个 checkpoint
 */
export async function getApprovalCheckpoint(
  checkpointId: string,
  workspaceId: string
): Promise<HumanApprovalCheckpoint | null> {
  const record = await prisma.approvalCheckpoint.findFirst({
    where: { checkpointId, workspaceId },
  });

  if (!record) {
    return null;
  }

  return mapDbToCheckpoint(record);
}

/**
 * 列出待审批 checkpoint
 */
export async function listPendingCheckpoints(
  workspaceId: string,
  options?: {
    riskLevel?: RiskLevel;
    triggerReason?: ApprovalTriggerReason;
    page?: number;
    pageSize?: number;
  }
): Promise<{ checkpoints: HumanApprovalCheckpoint[]; total: number }> {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 10;
  const skip = (page - 1) * pageSize;

  const whereClause: Prisma.ApprovalCheckpointWhereInput = {
    workspaceId,
    decision: 'pending',
    ...(options?.riskLevel ? { riskLevel: options.riskLevel } : {}),
    ...(options?.triggerReason ? { triggerReason: options.triggerReason } : {}),
  };

  const [records, total] = await Promise.all([
    prisma.approvalCheckpoint.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.approvalCheckpoint.count({
      where: whereClause,
    }),
  ]);

  return {
    checkpoints: records.map(mapDbToCheckpoint),
    total,
  };
}
