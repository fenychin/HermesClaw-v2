import { findProposalByIdOrAlias, serializeProposal } from "@/lib/server/harness-proposal-service";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";
import ApprovalsDetailClient from "./approvals-detail-client";
import { DEFAULT_CANARY_THRESHOLDS } from "@hermesclaw/hermes-kernel";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  
  let workspaceId = "default";
  if (session?.user?.id) {
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      select: { workspaceId: true },
    });
    if (member) {
      workspaceId = member.workspaceId;
    }
  }
  
  // 服务端直取提案
  const proposal = await findProposalByIdOrAlias(id, workspaceId);

  if (!proposal) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center space-y-4">
        <ShieldAlert className="size-12 text-danger mx-auto" />
        <h3 className="text-lg font-semibold text-foreground">未找到相关升级提案</h3>
        <Link href="/approvals" className="text-primary text-sm font-semibold flex items-center gap-1 mx-auto w-fit">
          <ArrowLeft className="size-4" /> 返回审批列表
        </Link>
      </div>
    );
  }

  // 序列化，同时保留 canaryMetrics
  const serialized = {
    ...serializeProposal(proposal),
    canaryMetrics: proposal.canaryMetrics ?? null,
  };

  return (
    <ApprovalsDetailClient
      initialProposal={serialized as any}
      id={id}
      canaryThresholds={{
        abortErrorRate: DEFAULT_CANARY_THRESHOLDS.abortErrorRate,
        promotionErrorRate: DEFAULT_CANARY_THRESHOLDS.promotionErrorRate,
        promotionSuccessRate: DEFAULT_CANARY_THRESHOLDS.promotionSuccessRate,
      }}
    />
  );
}
