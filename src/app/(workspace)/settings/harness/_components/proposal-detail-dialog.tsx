"use client";

import type { HarnessProposal } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RiskBadge } from "@/components/common/risk-badge";
import { AutomationBadge } from "@/components/common/automation-badge";
import { StatusBadge } from "@/components/common/status-badge";
import {
  FileWarning,
  Layers,
  Target,
  RotateCcw,
  ListChecks,
} from "lucide-react";

interface ProposalDetailDialogProps {
  proposal: HarnessProposal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 提案详情弹窗
 * —— 展示 Harness 升级提案的完整信息，包括证据链、变更描述、影响范围和回滚方案
 */
export function ProposalDetailDialog({
  proposal,
  open,
  onOpenChange,
}: ProposalDetailDialogProps) {
  if (!proposal) return null;

  const { proposedChange } = proposal;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-hint text-xs font-mono">
              {proposal.proposalId}
            </span>
            <StatusBadge
              status={
                proposal.status === "rolled-back" ? "error" : proposal.status
              }
            />
          </div>
          <DialogTitle className="text-base">
            {proposedChange.targetComponent} — 升级提案
          </DialogTitle>
          <DialogDescription className="sr-only">
            Harness 升级提案详情
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* 标签行 */}
          <div className="flex items-center gap-2">
            <RiskBadge level={proposedChange.riskLevel} />
            <AutomationBadge level={proposedChange.automationLevel} />
          </div>

          {/* 问题陈述 */}
          <Section icon={FileWarning} title="问题陈述">
            <p className="text-muted-foreground">{proposal.problemStatement}</p>
          </Section>

          {/* 证据链 */}
          <Section icon={ListChecks} title="证据链">
            <ul className="space-y-1.5">
              {proposal.evidence.map((item, idx) => (
                <li
                  key={idx}
                  className="text-muted-foreground text-xs bg-accent/50 rounded-lg px-3 py-2 font-mono leading-relaxed"
                >
                  {item}
                </li>
              ))}
            </ul>
          </Section>

          {/* 变更方案 */}
          <Section icon={Layers} title="变更方案">
            <p className="text-muted-foreground">
              {proposedChange.description}
            </p>
          </Section>

          {/* 影响范围 */}
          <Section icon={Target} title="影响范围">
            <p className="text-muted-foreground mb-2">
              {proposal.estimatedImpact}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {proposal.affectedAgents.map((agent) => (
                <span
                  key={agent}
                  className="bg-primary/10 text-primary text-xs rounded-lg px-2 py-0.5"
                >
                  {agent}
                </span>
              ))}
            </div>
          </Section>

          {/* 回滚方案 */}
          <Section icon={RotateCcw} title="回滚方案">
            <p className="text-muted-foreground">{proposal.rollbackPlan}</p>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 详情内的分段组件 */
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-foreground text-xs font-medium mb-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        {title}
      </div>
      {children}
    </div>
  );
}
