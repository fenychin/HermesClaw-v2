"use client";

import { useCallback } from "react";
import type { HarnessProposal } from "@/types";
import { cn } from "@/lib/utils";
import { RiskBadge } from "@/components/common/risk-badge";
import { AutomationBadge } from "@/components/common/automation-badge";
import { StatusBadge } from "@/components/common/status-badge";
import {
  Zap,
  UserCog,
  Eye,
  Check,
  X,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProposalCardProps {
  proposal: HarnessProposal;
  /** 查看详情回调 */
  onViewDetail?: (proposal: HarnessProposal) => void;
  /** 批准回调 */
  onApprove?: (proposal: HarnessProposal) => void;
  /** 拒绝回调 */
  onReject?: (proposal: HarnessProposal) => void;
}

/** 触发方式图标 + 文案 */
function TriggerLabel({ by }: { by: "auto" | "manual" }) {
  return (
    <span className="inline-flex items-center gap-1 text-hint text-xs">
      {by === "auto" ? (
        <Zap className="size-3" />
      ) : (
        <UserCog className="size-3" />
      )}
      {by === "auto" ? "自动评估" : "手动触发"}
    </span>
  );
}

/** 格式化日期为人类可读文本 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `${month}月${day}日 ${hours}:${minutes}`;
}

/**
 * Harness 升级提案卡片
 * —— 展示提案编号、问题描述、风险等级、影响范围和审批操作
 */
export function ProposalCard({
  proposal,
  onViewDetail,
  onApprove,
  onReject,
}: ProposalCardProps) {
  const { proposedChange, status } = proposal;
  const isPending = status === "pending";

  const handleApprove = useCallback(() => {
    onApprove?.(proposal);
  }, [proposal, onApprove]);

  const handleReject = useCallback(() => {
    onReject?.(proposal);
  }, [proposal, onReject]);

  const handleViewDetail = useCallback(() => {
    onViewDetail?.(proposal);
  }, [proposal, onViewDetail]);

  return (
    <div
      className={cn(
        "bg-card rounded-2xl border border-border p-5 mb-3 transition-colors hover:border-border/80",
        /* 待审批卡片：左侧高亮条 */
        isPending && "border-l-2 border-l-warning/60",
      )}
    >
      {/* 顶部：提案编号 + 标题 / 风险等级 badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-hint text-xs font-mono">
              {proposal.proposalId}
            </span>
            <StatusBadge status={status === "rolled-back" ? "error" : status} />
          </div>
          <h3 className="text-foreground font-medium mt-1 truncate">
            {proposedChange.targetComponent} — {proposedChange.description.slice(0, 40)}…
          </h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AutomationBadge level={proposedChange.automationLevel} />
          <RiskBadge level={proposedChange.riskLevel} />
        </div>
      </div>

      {/* 中：问题描述 */}
      <p className="text-muted-foreground text-sm line-clamp-2 mt-2">
        {proposal.problemStatement}
      </p>

      {/* 影响范围 badge 列表 */}
      <div className="flex flex-wrap gap-2 mt-3">
        {proposal.affectedAgents.map((agent) => (
          <span
            key={agent}
            className="bg-primary/10 text-primary text-xs rounded-lg px-2 py-0.5"
          >
            {agent}
          </span>
        ))}
      </div>

      {/* 底部：触发方式 + 创建时间 / 操作按钮 */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-3">
          <TriggerLabel by={proposal.triggeredBy} />
          <span className="inline-flex items-center gap-1 text-hint text-xs">
            <Clock className="size-3" />
            {formatDate(proposal.createdAt)}
          </span>
          {proposal.reviewedAt && (
            <span className="text-hint text-xs">
              审批于 {formatDate(proposal.reviewedAt)}
            </span>
          )}
        </div>

        {/* 操作按钮组：仅待审批状态显示 */}
        {isPending && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={handleViewDetail}
              className="text-muted-foreground"
            >
              <Eye className="size-3" />
              查看详情
            </Button>
            <Button
              size="xs"
              onClick={handleApprove}
              className="bg-success/20 text-success hover:bg-success/30 rounded-xl"
            >
              <Check className="size-3" />
              批准
            </Button>
            <Button
              size="xs"
              onClick={handleReject}
              className="bg-danger/20 text-danger hover:bg-danger/30 rounded-xl"
            >
              <X className="size-3" />
              拒绝
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
