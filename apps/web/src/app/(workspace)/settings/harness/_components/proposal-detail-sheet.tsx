import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { HarnessProposal } from "@/types";
import { resolveAutomationLevel } from "@/types";

interface ProposalDetailSheetProps {
  proposal: HarnessProposal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (proposal: HarnessProposal) => void;
  onReject: (proposal: HarnessProposal) => void;
}

export function ProposalDetailSheet({
  proposal,
  open,
  onOpenChange,
  onApprove,
  onReject,
}: ProposalDetailSheetProps) {
  if (!proposal) return null;

  const {
    proposalId,
    status,
    triggeredBy,
    createdAt,
    problemStatement,
    evidence,
    proposedChange,
    affectedAgents,
    rollbackPlan,
    reviewedBy,
    reviewedAt,
  } = proposal;

  const { targetComponent, description, riskLevel } = proposedChange;
  const automationLevel = resolveAutomationLevel(proposedChange.automationLevel, riskLevel);

  const isPending = status === "pending";
  const isL4 = automationLevel === "L4";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[560px] p-0 flex flex-col gap-0 border-l border-border" showCloseButton>
        {/* 1. 头部区域 */}
        <SheetHeader className="px-6 py-5 border-b border-border bg-background/50 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="space-y-1 pr-8">
            <p className="text-hint text-xs font-mono">{proposalId}</p>
            <SheetTitle className="text-foreground text-lg font-semibold leading-tight">
              Harness 升级提案
            </SheetTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {/* 状态 badge */}
            <Badge
              variant="outline"
              className={
                status === "approved"
                  ? "border-success/30 text-success bg-success/10"
                  : status === "rejected"
                  ? "border-danger/30 text-danger bg-danger/10"
                  : "border-warning/30 text-warning bg-warning/10"
              }
            >
              {status === "approved" ? "已批准" : status === "rejected" ? "已驳回" : "待审批"}
            </Badge>

            {/* 风险等级 badge */}
            <Badge
              variant="outline"
              className={
                riskLevel === "high"
                  ? "border-danger/30 text-danger bg-danger/10"
                  : riskLevel === "medium"
                  ? "border-warning/30 text-warning bg-warning/10"
                  : "border-success/30 text-success bg-success/10"
              }
            >
              风险: {riskLevel.toUpperCase()}
            </Badge>

            {/* 自动化等级 badge */}
            <Badge
              variant="outline"
              className={
                automationLevel === "L1"
                  ? "border-success/30 text-success bg-success/10"
                  : automationLevel === "L2"
                  ? "border-muted/30 text-muted-foreground bg-muted/10"
                  : automationLevel === "L3"
                  ? "border-warning/30 text-warning bg-warning/10"
                  : "border-danger/30 text-danger bg-danger/10"
              }
            >
              {automationLevel}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            创建于 {new Date(createdAt).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/\//g, "-")} · 由{" "}
            <span className="font-medium text-foreground">
              {triggeredBy === "auto" ? "自动评估" : "手动触发"}
            </span>{" "}
            发起
          </p>
        </SheetHeader>

        {/* 内容滚动区 */}
        <ScrollArea className="flex-1 px-6 py-5">
          <div className="space-y-5 pb-6">
            {/* 2. 问题陈述卡片 */}
            <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span>📋</span> 问题陈述
              </h3>
              <p className="text-foreground text-sm leading-6 whitespace-pre-wrap mb-4">
                {problemStatement}
              </p>
              {evidence && evidence.length > 0 && (
                <ul className="space-y-1.5">
                  {evidence.map((item, i) => (
                    <li key={i} className="text-muted-foreground text-sm flex items-start gap-2">
                      <span className="text-hint shrink-0 mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 3. 变更方案卡片 */}
            <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span>🔧</span> 变更方案
              </h3>
              <div className="mb-3">
                <span className="inline-block bg-primary/10 text-primary rounded-lg px-2 py-1 text-sm font-medium">
                  {targetComponent}
                </span>
              </div>
              <p className="text-foreground text-sm leading-6 whitespace-pre-wrap mb-4">
                {description}
              </p>
              <div className="text-success text-sm flex items-start gap-2 bg-success/5 p-3 rounded-xl">
                <span className="shrink-0 font-bold mt-0.5">✓</span>
                <span className="whitespace-pre-wrap leading-relaxed">{proposal.estimatedImpact}</span>
              </div>
            </div>

            {/* 4. 影响范围卡片 */}
            <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span>🌐</span> 影响范围
              </h3>
              {affectedAgents && affectedAgents.length > 0 ? (
                <ul className="space-y-2 mb-4">
                  {affectedAgents.map((agent, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                      <div className="size-1.5 rounded-full bg-primary" />
                      {agent}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground mb-4">无直接影响智能体</p>
              )}

              {riskLevel === "high" && (
                <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 text-sm text-danger flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">⚠️</span>
                  <span>高风险变更：此修改可能影响核心业务逻辑，请务必确认是否需要同时调整相关的保护性边界规则。</span>
                </div>
              )}
            </div>

            {/* 5. 回滚方案卡片 */}
            <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span>🔄</span> 回滚方案
              </h3>
              <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground text-sm whitespace-pre-wrap">
                {rollbackPlan}
              </ol>
            </div>
          </div>
        </ScrollArea>

        {/* 6. 底部固定操作栏 */}
        <div className="shrink-0 border-t border-border bg-background px-6 py-4 flex items-center justify-between mt-auto">
          {isPending ? (
            <div className="flex items-center gap-3 w-full">
              <Button
                variant="ghost"
                className="flex-1 text-danger hover:text-danger hover:bg-danger/10"
                onClick={() => {
                  onReject(proposal);
                  onOpenChange(false);
                }}
              >
                拒绝
              </Button>

              {isL4 ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger render={
                      <span className="flex-1 flex" tabIndex={0}>
                        <Button
                          variant="default"
                          className="w-full flex-1"
                          disabled
                          aria-disabled="true"
                        >
                          批准执行
                        </Button>
                      </span>
                    } />
                    <TooltipContent side="top">
                      <p>L4 操作须在源业务系统手动发起，不可通过此系统批准</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button
                  variant="default"
                  className="flex-1"
                  onClick={() => {
                    onApprove(proposal);
                    onOpenChange(false);
                  }}
                >
                  批准执行
                </Button>
              )}
            </div>
          ) : (
            <div className="w-full flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                由 <span className="font-medium text-foreground">{reviewedBy || "系统"}</span> 于{" "}
                {reviewedAt ? new Date(reviewedAt).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/\//g, "-") : "未知时间"} 审批
              </span>
              <span className="text-hint px-2 py-1 bg-muted rounded">只读</span>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
