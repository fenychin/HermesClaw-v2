/**
 * Harness Handler — Harness 评估/提案/状态核心业务逻辑
 *
 * 从 apps/web/src/app/api/harness/[id]/route.ts 下沉至此
 *
 * 三域归属：Hermes Control Kernel
 */

import {
  runHarnessEvaluation as runHarnessEvaluationCore,
  type EvaluationResult,
  type EvaluationSeverity,
  type ProposalType,
} from "../harness";

export interface HarnessHandlerDeps {
  prisma: any;
}

// 重新导出新版评估引擎和提案写入器，保持 root index.ts 的兼容性。
export { runHarnessEvaluationCore as runHarnessEvaluation };
export { writeProposalsFromEvaluation } from "../harness";
export type {
  EvaluationResult,
  EvaluationSignal,
  EvaluationSeverity,
  ProposalType,
  RunHarnessEvaluationInput as HarnessEvaluateInput,
  RunHarnessEvaluationDeps,
  WriteProposalsParams,
} from "../harness";

// ==============================
// Harness Status
// ==============================

export interface HarnessStatusInput {
  workspaceId: string;
  evalWindowHours?: number;
}

export async function getHarnessStatus(
  input: HarnessStatusInput,
  deps: HarnessHandlerDeps,
): Promise<any> {
  const { workspaceId } = input;
  const evalWindowHours = input.evalWindowHours ?? 24;
  const p = deps.prisma;
  const [latest, pendingCount, totalProposals] = await Promise.all([
    p.harnessProposal.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    p.harnessProposal.count({ where: { status: "pending", workspaceId } }),
    p.harnessProposal.count({ where: { workspaceId } }),
  ]);
  return {
    lastEvaluatedAt: latest?.createdAt?.toISOString() ?? null,
    nextEvaluatedAt: latest ? new Date(latest.createdAt.getTime() + evalWindowHours * 3600000).toISOString() : null,
    pendingCount, totalProposals, intervalHours: evalWindowHours,
  };
}

// ==============================
// Harness Proposals CRUD
// ==============================

export interface HarnessProposalListInput {
  workspaceId: string;
  page?: number;
  limit?: number;
  status?: string;
}

export async function listHarnessProposals(
  input: HarnessProposalListInput,
  deps: HarnessHandlerDeps,
): Promise<any> {
  const { workspaceId } = input;
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const where: any = { workspaceId };
  if (input.status) where.status = input.status;
  const p = deps.prisma;
  const [items, total] = await Promise.all([
    p.harnessProposal.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    p.harnessProposal.count({ where }),
  ]);
  return { items: items.map((i: any) => ({ ...i, createdAt: i.createdAt?.toISOString(), updatedAt: i.updatedAt?.toISOString() })), total, page, limit };
}

export interface HarnessProposalGetInput {
  id: string;
  workspaceId: string;
}

export async function getHarnessProposal(
  input: HarnessProposalGetInput,
  deps: HarnessHandlerDeps,
): Promise<any> {
  const p = deps.prisma;
  const proposal = await p.harnessProposal.findUnique({ where: { id: input.id } });
  if (!proposal || proposal.workspaceId !== input.workspaceId) return null;
  return { ...proposal, createdAt: proposal.createdAt?.toISOString(), updatedAt: proposal.updatedAt?.toISOString() };
}

// ==============================
// Harness Approve / Reject / Rollback
// ==============================

export interface HarnessApproveInput {
  proposalId: string;
  workspaceId: string;
  actor: string;
  confirm?: boolean;
  reason?: string;
}

export interface HarnessDecisionResult {
  ok: boolean;
  message: string;
  proposal?: any;
  /** 决策后的状态：'active' | 'canary' | 'rejected' | 'rolled-back' */
  newStatus?: HarnessProposalStatus;
}

// ==============================
// Sprint 2：Canary 配置 + 风险等级判定
// ==============================

export type HarnessProposalStatus =
  | "draft"
  | "pending"
  | "approved"
  | "canary"
  | "active"
  | "rejected"
  | "rolled_back";

export type HarnessProposalRiskLevel = "low" | "medium" | "high" | "critical";

export interface CanaryConfig {
  /** 观察窗口（小时），到点后 cron 触发 promote/rollback 决策 */
  durationHours: number;
  /** 通过门槛：canary 期间 AgentLog 成功率必须 >= 此阈值 */
  successThreshold: number;
}

const DEFAULT_CANARY_CONFIG: CanaryConfig = {
  durationHours: 24,
  successThreshold: 0.95,
};

const RISK_RANK: Record<HarnessProposalRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function readRiskLevel(proposal: any): HarnessProposalRiskLevel {
  // proposedChange 可能是 Json 对象（Prisma JSON 列）或字符串
  const pc =
    typeof proposal?.proposedChange === "string"
      ? safeJsonParse(proposal.proposedChange)
      : proposal?.proposedChange;
  const raw = pc?.riskLevel;
  if (raw === "low" || raw === "medium" || raw === "high" || raw === "critical")
    return raw;
  // 兜底：用 estimatedImpact / evidence.severity 推断
  const sev =
    typeof proposal?.estimatedImpact === "string"
      ? proposal.estimatedImpact
      : null;
  if (sev === "high" || sev === "critical") return "high";
  if (sev === "medium") return "medium";
  return "low";
}

function safeJsonParse(s: unknown): any {
  if (typeof s !== "string") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function shouldEnterCanary(risk: HarnessProposalRiskLevel): boolean {
  return RISK_RANK[risk] >= RISK_RANK.high;
}

function readCanaryConfig(proposal: any): CanaryConfig {
  const dur = Number(proposal?.canaryWindowHours);
  const durationHours =
    Number.isFinite(dur) && dur > 0
      ? dur
      : DEFAULT_CANARY_CONFIG.durationHours;
  return {
    durationHours,
    successThreshold: DEFAULT_CANARY_CONFIG.successThreshold,
  };
}

// ==============================
// Audit 写入（Sprint 2 PART C）
// ==============================

interface AuditPayload {
  workspaceId: string;
  action: string;
  actor: string;
  targetId: string;
  before: HarnessProposalStatus | string;
  after: HarnessProposalStatus | string;
  riskLevel?: HarnessProposalRiskLevel;
  extra?: Record<string, unknown>;
}

async function writeProposalAudit(
  prisma: any,
  payload: AuditPayload,
): Promise<void> {
  if (!prisma?.auditLog?.create) return;
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: payload.workspaceId,
        action: payload.action,
        actor: payload.actor,
        targetType: "proposal",
        targetId: payload.targetId,
        detail: JSON.stringify({
          before: payload.before,
          after: payload.after,
          ...(payload.extra ?? {}),
        }),
        riskLevel: payload.riskLevel ?? null,
        triggeredBy: payload.actor === "cron" || payload.actor === "system" ? "system" : "user",
        status: "success",
        createdAt: new Date(),
      },
    });
  } catch {
    // AuditLog 写失败不应反向阻塞业务，记录到 proposal 的 detail 字段已足够
  }
}

// ==============================
// approve / reject / rollback
// ==============================

export async function approveHarnessProposal(
  input: HarnessApproveInput,
  deps: HarnessHandlerDeps,
): Promise<HarnessDecisionResult> {
  const p = deps.prisma;
  const proposal = await p.harnessProposal.findUnique({ where: { id: input.proposalId } });
  if (!proposal || proposal.workspaceId !== input.workspaceId) {
    return { ok: false, message: "提案不存在" };
  }
  if (proposal.status !== "pending") {
    return { ok: false, message: `提案状态为 ${proposal.status}，不可审批` };
  }

  const before = proposal.status as HarnessProposalStatus;
  const now = new Date();

  const updated = await p.harnessProposal.update({
    where: { id: input.proposalId },
    data: {
      status: "approved",
      approvedBy: input.actor,
      approvedAt: now,
      reviewedBy: input.actor,
      reviewedAt: now,
    },
  });

  await writeProposalAudit(p, {
    workspaceId: input.workspaceId,
    action: "proposal.approve",
    actor: input.actor,
    targetId: input.proposalId,
    before,
    after: "approved",
  });

  return {
    ok: true,
    message: "提案已审批",
    proposal: { ...proposal, ...updated, status: "approved" },
    newStatus: "approved",
  };
}

export async function rejectHarnessProposal(
  input: HarnessApproveInput,
  deps: HarnessHandlerDeps,
): Promise<HarnessDecisionResult> {
  const p = deps.prisma;
  const proposal = await p.harnessProposal.findUnique({ where: { id: input.proposalId } });
  if (!proposal || proposal.workspaceId !== input.workspaceId) return { ok: false, message: "提案不存在" };
  if (proposal.status !== "pending") return { ok: false, message: `提案状态为 ${proposal.status}，不可驳回` };

  const before = proposal.status as HarnessProposalStatus;
  const now = new Date();
  const risk = readRiskLevel(proposal);

  await p.harnessProposal.update({
    where: { id: input.proposalId },
    data: {
      status: "rejected",
      rejectedBy: input.actor,
      rejectedAt: now,
      reviewedBy: input.actor,
      reviewedAt: now,
    },
  });

  await writeProposalAudit(p, {
    workspaceId: input.workspaceId,
    action: "proposal.reject",
    actor: input.actor,
    targetId: input.proposalId,
    before,
    after: "rejected",
    riskLevel: risk,
    extra: input.reason ? { reason: input.reason } : undefined,
  });

  return { ok: true, message: "提案已驳回", newStatus: "rejected" };
}

export async function rollbackHarnessProposal(
  input: HarnessApproveInput,
  deps: HarnessHandlerDeps,
): Promise<HarnessDecisionResult> {
  const p = deps.prisma;
  const proposal = await p.harnessProposal.findUnique({ where: { id: input.proposalId } });
  if (!proposal || proposal.workspaceId !== input.workspaceId) return { ok: false, message: "提案不存在" };
  if (proposal.status !== "active" && proposal.status !== "canary" && proposal.status !== "approved") {
    return { ok: false, message: "只能回滚已审批、激活或灰度中的提案" };
  }

  const before = proposal.status as HarnessProposalStatus;
  const now = new Date();
  const risk = readRiskLevel(proposal);

  // 还原 previousSnapshot 到 workspace 配置
  const snapshot = proposal.previousSnapshot
    ? (typeof proposal.previousSnapshot === "string"
        ? safeJsonParse(proposal.previousSnapshot)
        : proposal.previousSnapshot)
    : null;
  if (snapshot?.workspace) {
    try {
      await p.workspace.update({
        where: { id: input.workspaceId },
        data: {
          automationLevel: snapshot.workspace.automationLevel ?? undefined,
        },
      });
    } catch {
      /* snapshot restore best-effort */
    }
  }
  if (snapshot?.settings) {
    try {
      await p.workspaceSettings.upsert({
        where: { workspaceId: input.workspaceId },
        create: {
          workspaceId: input.workspaceId,
          defaultModel: snapshot.settings.defaultModel ?? "deepseek-chat",
          taskProviderMap: snapshot.settings.taskProviderMap ?? "{}",
          workflowEngine: snapshot.settings.workflowEngine ?? "local",
        },
        update: {
          defaultModel: snapshot.settings.defaultModel ?? undefined,
          taskProviderMap: snapshot.settings.taskProviderMap ?? undefined,
          workflowEngine: snapshot.settings.workflowEngine ?? undefined,
        },
      });
    } catch {
      /* snapshot restore best-effort */
    }
  }

  await p.harnessProposal.update({
    where: { id: input.proposalId },
    data: {
      status: "rolled_back",
      rolledBackBy: input.actor,
      rolledBackAt: now,
      canaryCompletedAt: before === "canary" ? now : undefined,
      canaryRollbackReason: input.reason ?? "manual rollback",
    },
  });

  await writeProposalAudit(p, {
    workspaceId: input.workspaceId,
    action: "proposal.rollback",
    actor: input.actor,
    targetId: input.proposalId,
    before,
    after: "rolled_back",
    riskLevel: risk,
    extra: input.reason ? { reason: input.reason } : undefined,
  });

  return { ok: true, message: "提案已回滚", newStatus: "rolled_back" };
}

// ==============================
// 启动 Canary（approved → canary）
// ==============================

export interface StartCanaryInput {
  proposalId: string;
  workspaceId: string;
  actor: string;
}

export async function startCanary(
  input: StartCanaryInput,
  deps: HarnessHandlerDeps,
): Promise<HarnessDecisionResult> {
  const p = deps.prisma;
  const proposal = await p.harnessProposal.findUnique({ where: { id: input.proposalId } });
  if (!proposal || proposal.workspaceId !== input.workspaceId) {
    return { ok: false, message: "提案不存在" };
  }
  if (proposal.status !== "approved") {
    return { ok: false, message: `提案状态为 ${proposal.status}，不可启动 Canary` };
  }

  const before = proposal.status as HarnessProposalStatus;
  const now = new Date();

  // 将当前 workspace active Harness 配置写入 previousSnapshot
  const snapshot = await captureWorkspaceSnapshot(p, input.workspaceId);

  const windowHours = readCanaryConfig(proposal).durationHours;

  await p.harnessProposal.update({
    where: { id: input.proposalId },
    data: {
      status: "canary",
      canaryStartedAt: now,
      canaryWindowHours: windowHours,
      previousSnapshot: snapshot,
    },
  });

  await writeProposalAudit(p, {
    workspaceId: input.workspaceId,
    action: "harness.canary.started",
    actor: input.actor,
    targetId: input.proposalId,
    before,
    after: "canary",
    extra: { canaryWindowHours: windowHours },
  });

  const canaryEndAt = new Date(now.getTime() + windowHours * 3600_000);

  return {
    ok: true,
    message: "Canary 已启动",
    newStatus: "canary",
    proposal: {
      canaryStartedAt: now.toISOString(),
      canaryEndAt: canaryEndAt.toISOString(),
      canaryWindowHours: windowHours,
    },
  };
}

// ==============================
// 激活提案（canary → active）
// ==============================

export interface ActivateProposalInput {
  proposalId: string;
  workspaceId: string;
  actor: string;
}

export async function activateProposal(
  input: ActivateProposalInput,
  deps: HarnessHandlerDeps,
): Promise<HarnessDecisionResult> {
  const p = deps.prisma;
  const proposal = await p.harnessProposal.findUnique({ where: { id: input.proposalId } });
  if (!proposal || proposal.workspaceId !== input.workspaceId) {
    return { ok: false, message: "提案不存在" };
  }
  if (proposal.status !== "canary") {
    return { ok: false, message: `提案状态为 ${proposal.status}，不可激活` };
  }

  const before = proposal.status as HarnessProposalStatus;
  const now = new Date();

  // Fail-safe：若 canaryMetrics 存在且 workflow 失败率 > 0.3，拒绝激活
  const metrics = proposal.canaryMetrics
    ? (typeof proposal.canaryMetrics === "string"
        ? safeJsonParse(proposal.canaryMetrics)
        : proposal.canaryMetrics)
    : null;
  if (metrics?.workflowFailureRate != null && metrics.workflowFailureRate > 0.3) {
    return {
      ok: false,
      message: `Canary 期间工作流失败率 ${(metrics.workflowFailureRate * 100).toFixed(1)}% 超过阈值 30%，拒绝激活`,
    };
  }

  await p.harnessProposal.update({
    where: { id: input.proposalId },
    data: {
      status: "active",
      activatedAt: now,
    },
  });

  // 将同 workspace 内其他 active 提案标记为 superseded（通过写入新 HarnessProposal 或更新字段）
  try {
    const sameWsActive = await p.harnessProposal.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: "active",
        id: { not: input.proposalId },
      },
    });
    for (const other of sameWsActive) {
      await p.harnessProposal.update({
        where: { id: other.id },
        data: { status: "rolled_back", rolledBackAt: now, rolledBackBy: "system" },
      });
    }
  } catch {
    /* best-effort */
  }

  await writeProposalAudit(p, {
    workspaceId: input.workspaceId,
    action: "harness.canary.activated",
    actor: input.actor,
    targetId: input.proposalId,
    before,
    after: "active",
  });

  return {
    ok: true,
    message: "提案已激活",
    newStatus: "active",
    proposal: { activatedAt: now.toISOString() },
  };
}

// ==============================
// Sprint 2 PART A：Canary → Active 自动晋级
// ==============================

export interface PromoteCanaryInput {
  proposalId: string;
  workspaceId: string;
  /** 触发者，默认 'cron'。也支持手动触发时传入 actor。 */
  actor?: string;
  /** 强制覆盖窗口检查（用于手动晋级），默认 false */
  force?: boolean;
}

export interface PromoteCanaryResult {
  ok: boolean;
  message: string;
  /** 'promoted' | 'rolled-back' | 'pending' | 'skipped' */
  outcome: "promoted" | "rolled-back" | "pending" | "skipped";
  metrics?: {
    sampleSize: number;
    errorCount: number;
    successRate: number;
    successThreshold: number;
    elapsedHours: number;
    durationHours: number;
  };
}

/**
 * 计算 Canary 期间 Agent 错误率（基于 AgentLog）。
 * 窗口为 [canaryStartedAt, now]。
 *
 * 错误率口径：status === 'error' 视为错误；
 * 'success' / 'completed' / 'ok' 视为成功；其它状态忽略不计入分母。
 */
async function computeCanaryAgentMetrics(
  prisma: any,
  workspaceId: string,
  windowStart: Date,
): Promise<{ sampleSize: number; errorCount: number; successRate: number }> {
  if (!prisma?.agentLog?.findMany) {
    return { sampleSize: 0, errorCount: 0, successRate: 1 };
  }
  const logs: Array<{ status: string }> = await prisma.agentLog.findMany({
    where: { workspaceId, createdAt: { gte: windowStart } },
    select: { status: true },
  });

  let errors = 0;
  let counted = 0;
  for (const l of logs) {
    if (l.status === "error" || l.status === "failed") {
      errors += 1;
      counted += 1;
    } else if (
      l.status === "success" ||
      l.status === "completed" ||
      l.status === "ok"
    ) {
      counted += 1;
    }
    // 其它中间态（pending/running/...) 不计入
  }
  const successRate = counted === 0 ? 1 : (counted - errors) / counted;
  return { sampleSize: counted, errorCount: errors, successRate };
}

/**
 * 评估并尝试将一个 canary 提案晋级为 active。
 *
 * 决策逻辑（按顺序）：
 *  1. 提案不存在 / workspace 不匹配 → ok=false
 *  2. proposal.status !== 'canary' → outcome='skipped'
 *  3. 未到 durationHours：
 *       - force=true 时按当前指标评估
 *       - 否则 outcome='pending'
 *  4. 到点（或 force）：
 *       - 样本足够（>=5）且 successRate >= threshold → 晋级 active
 *       - 否则触发 rollback
 *
 * 所有终结性状态变更都会写入 AuditLog。
 */
export async function promoteCanaryToActive(
  input: PromoteCanaryInput,
  deps: HarnessHandlerDeps,
): Promise<PromoteCanaryResult> {
  const p = deps.prisma;
  const actor = input.actor ?? "cron";

  const proposal = await p.harnessProposal.findUnique({
    where: { id: input.proposalId },
  });
  if (!proposal || proposal.workspaceId !== input.workspaceId) {
    return { ok: false, message: "提案不存在", outcome: "skipped" };
  }
  if (proposal.status !== "canary") {
    return {
      ok: false,
      message: `提案状态为 ${proposal.status}，非 canary，跳过`,
      outcome: "skipped",
    };
  }

  const config = readCanaryConfig(proposal);
  const startedAt: Date | null = proposal.canaryStartedAt
    ? new Date(proposal.canaryStartedAt)
    : null;
  if (!startedAt) {
    return {
      ok: false,
      message: "Canary 起始时间缺失，无法评估",
      outcome: "skipped",
    };
  }

  const now = new Date();
  const elapsedMs = now.getTime() - startedAt.getTime();
  const elapsedHours = elapsedMs / 3600_000;
  const windowEnded = elapsedHours >= config.durationHours;

  // 未到点且未强制 → 维持 canary，等待下一个 cron tick
  if (!windowEnded && !input.force) {
    return {
      ok: true,
      message: `Canary 仍在观察期内（${elapsedHours.toFixed(1)}/${config.durationHours}h）`,
      outcome: "pending",
      metrics: {
        sampleSize: 0,
        errorCount: 0,
        successRate: 1,
        successThreshold: config.successThreshold,
        elapsedHours,
        durationHours: config.durationHours,
      },
    };
  }

  // 计算指标
  const metrics = await computeCanaryAgentMetrics(p, input.workspaceId, startedAt);
  const risk = readRiskLevel(proposal);

  // 样本量门槛：< 5 视为统计不足，等同未通过 → 触发 rollback 防止无依据放行
  const SAMPLE_FLOOR = 5;
  const passed =
    metrics.sampleSize >= SAMPLE_FLOOR &&
    metrics.successRate >= config.successThreshold;

  if (passed) {
    await p.harnessProposal.update({
      where: { id: input.proposalId },
      data: {
        status: "active",
        canaryCompletedAt: now,
        activatedAt: now,
      },
    });
    await writeProposalAudit(p, {
      workspaceId: input.workspaceId,
      action: "proposal.promote",
      actor,
      targetId: input.proposalId,
      before: "canary",
      after: "active",
      riskLevel: risk,
      extra: {
        successRate: metrics.successRate,
        successThreshold: config.successThreshold,
        sampleSize: metrics.sampleSize,
        elapsedHours,
      },
    });
    return {
      ok: true,
      message: `Canary 通过：成功率 ${(metrics.successRate * 100).toFixed(1)}% ≥ ${(config.successThreshold * 100).toFixed(0)}%，已晋级 active`,
      outcome: "promoted",
      metrics: { ...metrics, successThreshold: config.successThreshold, elapsedHours, durationHours: config.durationHours },
    };
  }

  // 失败 → 回滚
  const rollbackReason =
    metrics.sampleSize < SAMPLE_FLOOR
      ? `样本量不足（${metrics.sampleSize} < ${SAMPLE_FLOOR}），canary 期满未取得足够运行证据`
      : `成功率 ${(metrics.successRate * 100).toFixed(1)}% < ${(config.successThreshold * 100).toFixed(0)}%`;

  await p.harnessProposal.update({
    where: { id: input.proposalId },
    data: {
      status: "rolled_back",
      rolledBackBy: actor,
      rolledBackAt: now,
      canaryCompletedAt: now,
      canaryRollbackReason: rollbackReason,
    },
  });
  await writeProposalAudit(p, {
    workspaceId: input.workspaceId,
    action: "proposal.rollback",
    actor,
    targetId: input.proposalId,
    before: "canary",
    after: "rolled_back",
    riskLevel: risk,
    extra: {
      reason: rollbackReason,
      successRate: metrics.successRate,
      successThreshold: config.successThreshold,
      sampleSize: metrics.sampleSize,
      elapsedHours,
    },
  });

  return {
    ok: true,
    message: `Canary 未通过：${rollbackReason}，已自动回滚`,
    outcome: "rolled-back",
    metrics: { ...metrics, successThreshold: config.successThreshold, elapsedHours, durationHours: config.durationHours },
  };
}

// ==============================
// Harness Evaluation
// —— 占位实现已迁移至 ../harness/index.ts。
// —— 真实评估引擎通过本文件顶部的 `export { runHarnessEvaluation }` 暴露。
// ==============================

// ==============================
// Harness Proposal 生成
// —— 把 EvaluationResult 写入 HarnessProposal 表
// ==============================

export interface GenerateHarnessProposalsInput {
  workspaceId: string;
  windowHours?: number;
}

export interface GenerateHarnessProposalsDeps {
  prisma: any;
  callLlm: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

export interface GenerateHarnessProposalsResult {
  generated: number;
  proposals: any[];
}

const SEVERITY_RANK: Record<EvaluationSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function severityToRiskLevel(s: EvaluationSeverity): "low" | "medium" | "high" {
  if (s === "low") return "low";
  if (s === "medium") return "medium";
  return "high"; // high / critical → high
}

function proposalTypeToComponent(t: ProposalType): string {
  switch (t) {
    case "skill_binding":
      return "SkillBinding";
    case "workflow_template":
      return "WorkflowTemplate";
    case "memory_policy":
      return "MemoryPolicy";
    case "connector_policy":
      return "ConnectorPolicy";
    case "eval_rule":
      return "EvalRuleSet";
    default:
      return "Unknown";
  }
}

/** 采集 workspace 当前策略快照（用于 rollback / previousSnapshot 字段）。 */
async function captureWorkspaceSnapshot(
  prisma: any,
  workspaceId: string,
): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {
    workspaceId,
    capturedAt: new Date().toISOString(),
  };
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, automationLevel: true, plan: true },
    });
    if (ws) snapshot.workspace = ws;
  } catch {
    /* ignore */
  }
  try {
    if (prisma.workspaceSettings?.findUnique) {
      const settings = await prisma.workspaceSettings.findUnique({
        where: { workspaceId },
        select: {
          defaultModel: true,
          taskProviderMap: true,
          workflowEngine: true,
        },
      });
      if (settings) snapshot.settings = settings;
    }
  } catch {
    /* ignore */
  }
  return snapshot;
}

export async function generateHarnessProposals(
  input: GenerateHarnessProposalsInput,
  deps: GenerateHarnessProposalsDeps,
): Promise<GenerateHarnessProposalsResult> {
  const p = deps.prisma;

  // 1. 调用真实评估引擎
  const evalOut = await runHarnessEvaluationCore(
    { workspaceId: input.workspaceId, windowHours: input.windowHours },
    { prisma: p, callLlm: deps.callLlm },
  );

  // 2. 过滤 severity >= medium
  const eligible = evalOut.results.filter(
    (r) => SEVERITY_RANK[r.severity] >= SEVERITY_RANK.medium,
  );

  if (eligible.length === 0) {
    return { generated: 0, proposals: [] };
  }

  // 3. 准备 workspace 策略快照（一次即可，所有提案共享）
  const snapshot = await captureWorkspaceSnapshot(p, input.workspaceId);

  // 4. 写入 HarnessProposal
  const proposals: any[] = [];
  let seq = 0;
  for (const result of eligible) {
    seq += 1;
    const proposalId = `HEP-${Date.now()}-${seq}`;
    const evidence = {
      signal: result.signal,
      proposalType: result.proposalType,
      severity: result.severity,
      generatedBy: "harness-evaluation-engine",
    };
    const proposedChange = {
      targetComponent: proposalTypeToComponent(result.proposalType),
      description: result.suggestion,
      riskLevel: severityToRiskLevel(result.severity),
      automationLevel: "L2",
    };

    try {
      const created = await p.harnessProposal.create({
        data: {
          proposalId,
          workspaceId: input.workspaceId,
          triggeredBy: "auto",
          triggerReason: `harness-evaluation-engine: ${result.signal.type}`,
          problemStatement: `[AI生成] ${result.signal.type} 优化提案`,
          evidence,
          proposedChange,
          targetSkillId: null,
          requiresHumanApproval:
            SEVERITY_RANK[result.severity] >= SEVERITY_RANK.high,
          estimatedImpact: result.severity,
          affectedAgents: result.signal.agentId
            ? [result.signal.agentId]
            : [],
          rollbackPlan:
            "回滚至 previousSnapshot 中存储的 Workspace 策略快照（automationLevel + WorkspaceSettings）",
          previousSnapshot: snapshot,
          status: "pending",
        },
      });
      proposals.push({
        ...created,
        createdAt: created.createdAt?.toISOString?.() ?? created.createdAt,
        updatedAt: created.updatedAt?.toISOString?.() ?? created.updatedAt,
      });
    } catch (err) {
      // 单条失败不阻断整体，记录后继续
      proposals.push({
        proposalId,
        status: "create-failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    generated: proposals.filter((p) => p.status !== "create-failed").length,
    proposals,
  };
}

// ==============================
// Harness Evolution Log
// ==============================

export interface HarnessEvolutionLogInput {
  workspaceId: string;
  page?: number;
  limit?: number;
}

export async function getEvolutionLog(
  input: HarnessEvolutionLogInput,
  deps: HarnessHandlerDeps,
): Promise<any> {
  const p = deps.prisma;
  const page = input.page ?? 1;
  const limit = input.limit ?? 50;
  const [items, total] = await Promise.all([
    p.evolutionLog.findMany({ where: { workspaceId: input.workspaceId }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    p.evolutionLog.count({ where: { workspaceId: input.workspaceId } }),
  ]);
  return { items: items.map((i: any) => ({ ...i, createdAt: i.createdAt?.toISOString() })), total, page, limit };
}
