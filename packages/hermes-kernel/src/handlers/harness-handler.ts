/**
 * Harness Handler — Harness 评估/提案/状态核心业务逻辑
 *
 * 从 apps/web/src/app/api/harness/[id]/route.ts 下沉至此
 *
 * 三域归属：Hermes Control Kernel
 */

export interface HarnessHandlerDeps {
  prisma: any;
}

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
}

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
  await p.harnessProposal.update({ where: { id: input.proposalId }, data: { status: "active", approvedBy: input.actor, approvedAt: new Date() } });
  return { ok: true, message: "提案已审批通过", proposal: { ...proposal, status: "active" } };
}

export async function rejectHarnessProposal(
  input: HarnessApproveInput,
  deps: HarnessHandlerDeps,
): Promise<HarnessDecisionResult> {
  const p = deps.prisma;
  const proposal = await p.harnessProposal.findUnique({ where: { id: input.proposalId } });
  if (!proposal || proposal.workspaceId !== input.workspaceId) return { ok: false, message: "提案不存在" };
  if (proposal.status !== "pending") return { ok: false, message: `提案状态为 ${proposal.status}，不可驳回` };
  await p.harnessProposal.update({ where: { id: input.proposalId }, data: { status: "rejected", rejectedBy: input.actor, rejectedAt: new Date() } });
  return { ok: true, message: "提案已驳回" };
}

export async function rollbackHarnessProposal(
  input: HarnessApproveInput,
  deps: HarnessHandlerDeps,
): Promise<HarnessDecisionResult> {
  const p = deps.prisma;
  const proposal = await p.harnessProposal.findUnique({ where: { id: input.proposalId } });
  if (!proposal || proposal.workspaceId !== input.workspaceId) return { ok: false, message: "提案不存在" };
  if (proposal.status !== "active" && proposal.status !== "canary") return { ok: false, message: "只能回滚已激活或灰度中的提案" };
  await p.harnessProposal.update({ where: { id: input.proposalId }, data: { status: "rolled-back", rolledBackBy: input.actor, rolledBackAt: new Date() } });
  return { ok: true, message: "提案已回滚" };
}

// ==============================
// Harness Evaluation
// ==============================

export interface HarnessEvaluateInput {
  workspaceId: string;
}

export async function runHarnessEvaluation(
  input: HarnessEvaluateInput,
  deps: HarnessHandlerDeps,
): Promise<{ evaluations: number; anomalies: number }> {
  const p = deps.prisma;
  const anomalies = await p.harnessProposal.count({ where: { workspaceId: input.workspaceId, status: "pending" } });
  return { evaluations: anomalies > 0 ? anomalies : 1, anomalies };
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
