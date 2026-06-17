"use client";

import { useCallback } from "react";
import type { HarnessProposal } from "@/types";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/common/risk-badge";
import { AlertTriangle, Users, Undo2, ShieldAlert, Loader2 } from "lucide-react";

interface L3ApproveAlertProps {
  /** 待确认的高风险（L3）提案 */
  proposal: HarnessProposal | null;
  /** 对话框是否打开 */
  open: boolean;
  /** 开关回调 */
  onOpenChange: (open: boolean) => void;
  /** 用户点击「我已确认，执行审批」后触发 */
  onConfirm: (proposal: HarnessProposal) => void;
  /** 审批请求进行中 */
  isPending?: boolean;
}

/**
 * L3 高风险审批二次确认对话框（AGENTS.md §4.7 L3 强制人工确认 / §4.5 高危操作护栏）
 * —— 当 riskLevel === 'high' 时弹出，展示影响范围 / 回滚方案 / 风险描述，
 *    用户必须显式点击确认按钮才提交真实 approve API。
 *    风险级别用 bg-destructive / text-danger 渲染（CLAUDE.md §5）。
 */
export function L3ApproveAlert({
  proposal,
  open,
  onOpenChange,
  onConfirm,
  isPending = false,
}: L3ApproveAlertProps) {
  const handleConfirm = useCallback(() => {
    if (!proposal) return;
    onConfirm(proposal);
  }, [proposal, onConfirm]);

  if (!proposal) return null;

  const { proposedChange, affectedAgents, rollbackPlan, problemStatement } =
    proposal;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-danger">
            <span className="flex size-7 items-center justify-center rounded-lg bg-destructive/15">
              <AlertTriangle className="size-4 text-danger" />
            </span>
            高风险审批二次确认
            <RiskBadge level={proposedChange.riskLevel} className="ml-auto" />
          </AlertDialogTitle>
          <AlertDialogDescription>
            该提案为 L3 高风险级别，确认后将立即生效且不可撤销，请仔细核对以下信息。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 text-sm">
          {/* 风险描述 */}
          <section className="rounded-xl bg-destructive/5 border border-destructive/20 p-3">
            <div className="flex items-center gap-1.5 text-danger text-xs font-medium">
              <ShieldAlert className="size-3.5" />
              风险描述
            </div>
            <p className="text-foreground mt-1.5">{problemStatement}</p>
            <p className="text-muted-foreground mt-1">
              {proposedChange.targetComponent} — {proposedChange.description}
            </p>
          </section>

          {/* 影响范围 */}
          <section>
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
              <Users className="size-3.5" />
              影响范围
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {affectedAgents.length > 0 ? (
                affectedAgents.map((agent) => (
                  <span
                    key={agent}
                    className="bg-primary/10 text-primary text-xs rounded-lg px-2 py-0.5"
                  >
                    {agent}
                  </span>
                ))
              ) : (
                <span className="text-hint text-xs">无关联智能体</span>
              )}
            </div>
          </section>

          {/* 回滚方案 */}
          <section>
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
              <Undo2 className="size-3.5" />
              回滚方案
            </div>
            <p className="text-foreground mt-1.5">
              {rollbackPlan || "未提供回滚方案"}
            </p>
          </section>
        </div>

        <AlertDialogFooter>
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={handleConfirm}
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <AlertTriangle className="size-3.5" />
            )}
            我已确认，执行审批
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
