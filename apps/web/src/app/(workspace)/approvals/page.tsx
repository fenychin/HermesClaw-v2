import { expireStaleCheckpoints } from "@/lib/server/approval";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ApprovalsClient from "./approvals-client";

export interface ApprovalCheckpoint {
  id: string;
  checkpointId: string;
  taskId?: string;
  workflowRunId?: string;
  proposalId?: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  automationLevel: string;
  actionType: string;
  actionSummary: string;
  status: "pending" | "approved" | "rejected" | "expired" | "auto-approved";
  createdAt: string;
  expiresAt: string;
  requestedBy: string;
  remainingMs: number;
}

export default async function ApprovalsPage() {
  const session = await auth();
  const currentUser = {
    id: session?.user?.id || "unknown",
    email: session?.user?.email || "unknown",
    role: session?.user?.role || "VIEWER",
  };

  // 1. 服务端先进行过期清洗（对齐 API /api/approvals 行为）
  try {
    await expireStaleCheckpoints("default");
  } catch (err) {
    console.error("[ApprovalsPage] expireStaleCheckpoints failed:", err);
  }

  // 2. 直取数据库 checkpoints
  const records = await prisma.approvalCheckpoint.findMany({
    where: { workspaceId: "default" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // 获取发起人映射
  const logs = records.length > 0 ? await prisma.auditLog.findMany({
    where: { 
      action: "approval.requested", 
      targetId: { in: records.map((r) => r.checkpointId) } 
    },
    select: { targetId: true, actor: true }
  }) : [];
  const logMap = new Map(logs.map((l) => [l.targetId, l.actor]));

  const now = Date.now();
  const initialCheckpoints: ApprovalCheckpoint[] = records.map((r) => ({
    id: r.checkpointId,
    checkpointId: r.checkpointId,
    taskId: r.taskId ?? undefined,
    workflowRunId: r.workflowRunId ?? undefined,
    proposalId: r.proposalId ?? undefined,
    riskLevel: r.riskLevel as any,
    automationLevel: r.automationLevel,
    actionType: r.actionSummary?.split("：")[1] || r.actionSummary?.split(":")[1] || r.actionSummary,
    actionSummary: r.actionSummary,
    status: r.decision as any,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    requestedBy: logMap.get(r.checkpointId) || "system",
    remainingMs: Math.max(0, new Date(r.expiresAt).getTime() - now),
  }));

  // 3. 直取 proposals 列表
  const proposalRecords = await prisma.harnessProposal.findMany({
    where: { workspaceId: "default" },
    orderBy: { createdAt: "desc" },
  });

  const initialProposals = proposalRecords.map((p: any) => ({
    id: p.id,
    proposalId: p.proposalId,
    workspaceId: p.workspaceId,
    triggeredBy: p.triggeredBy,
    triggerReason: p.triggerReason,
    problemStatement: p.problemStatement,
    evidence: p.evidence ?? [],
    proposedChange: p.proposedChange,
    requiresHumanApproval: p.requiresHumanApproval,
    estimatedImpact: p.estimatedImpact,
    affectedAgents: p.affectedAgents ?? [],
    rollbackPlan: p.rollbackPlan,
    status: p.status,
    reviewedBy: p.reviewedBy ?? null,
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    previousSnapshot: p.previousSnapshot ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    version: "1.0.0",
  }));

  return (
    <ApprovalsClient 
      initialCheckpoints={initialCheckpoints} 
      initialProposals={initialProposals}
      currentUser={currentUser}
    />
  );
}
