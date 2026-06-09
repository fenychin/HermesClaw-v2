"use client";

import { useState, useCallback } from "react";
import type { HarnessProposal } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Lock, ShieldAlert } from "lucide-react";

/** 确认口令 */
const CONFIRM_PHRASE = "确认执行";

interface ApproveConfirmDialogProps {
  /** 待确认的提案 */
  proposal: HarnessProposal | null;
  /** Dialog 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onOpenChange: (open: boolean) => void;
  /** 确认后的回调（仅 L3 可触发，L4 不可通过此系统自动批准） */
  onConfirm: (proposalId: string) => void;
}

/**
 * L3/L4 高风险审批二次确认 Dialog
 * —— AGENTS.md §4.7：L3 强制人工二次确认；L4 绝对禁止自动，审批 API 对 L4 动作硬拒绝
 */
export function ApproveConfirmDialog({
  proposal,
  open,
  onOpenChange,
  onConfirm,
}: ApproveConfirmDialogProps) {
  const [inputValue, setInputValue] = useState("");

  const isL4 = proposal?.proposedChange.automationLevel === "L4";
  const canConfirm = !isL4 && inputValue === CONFIRM_PHRASE;

  const handleConfirm = useCallback(() => {
    if (!proposal || !canConfirm) return;
    onConfirm(proposal.id);
    setInputValue("");
    onOpenChange(false);
  }, [proposal, canConfirm, onConfirm, onOpenChange]);

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) setInputValue("");
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  if (!proposal) return null;

  const { proposedChange, affectedAgents, rollbackPlan } = proposal;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            {isL4 ? (
              <Lock className="size-5 text-danger" />
            ) : (
              <AlertTriangle className="size-5" />
            )}
            {isL4 ? "🔒 L4 绝对禁止自动" : "⚠️ 高风险操作确认"}
          </DialogTitle>
          <DialogDescription>
            {isL4
              ? "该操作为 L4 级别，系统永不自动执行。必须由人工在源业务系统发起。"
              : "该操作为 L3 高风险级别，需人工二次确认后才能执行。确认后立即生效且不可撤销。"}
          </DialogDescription>
        </DialogHeader>

        {/* 影响范围 */}
        <div className="space-y-3 text-sm">
          {/* 变更描述 */}
          <div>
            <span className="text-muted-foreground text-xs font-medium">
              变更内容
            </span>
            <p className="text-foreground mt-1">{proposedChange.description}</p>
          </div>

          {/* 影响智能体 */}
          <div>
            <span className="text-muted-foreground text-xs font-medium">
              影响范围
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {affectedAgents.map((agent) => (
                <span
                  key={agent}
                  className="bg-primary/10 text-primary text-xs rounded-lg px-2 py-0.5"
                >
                  {agent}
                </span>
              ))}
            </div>
          </div>

          {/* 回滚方案 */}
          <div>
            <span className="text-muted-foreground text-xs font-medium">
              回滚方案
            </span>
            <p className="text-foreground mt-1">{rollbackPlan}</p>
          </div>

          {/* L4 禁止说明 */}
          {isL4 && (
            <div className="flex items-start gap-2 rounded-xl bg-danger/5 border border-danger/20 p-3">
              <ShieldAlert className="size-4 text-danger shrink-0 mt-0.5" />
              <p className="text-danger text-xs">
                L4 级别操作不可通过此系统自动批准。审批 API 对 L4 动作的 approve
                必须硬拒绝（403）。请在源业务系统中手动发起此操作。
              </p>
            </div>
          )}

          {/* L3 确认输入框 */}
          {!isL4 && (
            <div>
              <label className="text-muted-foreground text-xs font-medium">
                请输入「{CONFIRM_PHRASE}」以激活确认按钮
              </label>
              <Input
                className="mt-1.5"
                placeholder={CONFIRM_PHRASE}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoFocus
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleClose(false)}
          >
            取消
          </Button>
          <Button
            size="sm"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className={
              canConfirm
                ? "bg-warning/20 text-warning hover:bg-warning/30"
                : ""
            }
          >
            {isL4 ? "不可批准" : "确认批准"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
