"use client";

import { memo } from "react";
import { Shield, AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface FreezeConfirmDialogProps {
  open: boolean;
  frozen: boolean;
  summary: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 冻结/解冻确认弹窗
 * —— 冻结操作需 ADMIN 权限（API 层校验），前端展示确认对话框
 */
export const FreezeConfirmDialog = memo(function FreezeConfirmDialog({
  open,
  frozen,
  summary,
  loading,
  onConfirm,
  onCancel,
}: FreezeConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(opened) => !opened && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className={frozen ? "size-5 text-amber-500" : "size-5 text-brand"} />
            {frozen ? "冻结此记忆" : "解冻此记忆"}
          </DialogTitle>
          <DialogDescription className="text-left">
            {frozen ? (
              <div className="space-y-2">
                <p className="text-sm text-foreground">
                  冻结后，AI 将<span className="font-semibold text-danger">无法自动覆写</span>此记忆。
                </p>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-600 dark:text-amber-400">
                    <p className="font-medium">需 ADMIN 权限</p>
                    <p>冻结操作将写入 AuditLog，可在审计日志中追溯。</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-foreground">
                  解冻后，AI 可在自演化过程中<span className="font-semibold text-brand">更新</span>此记忆。
                </p>
                <div className="bg-brand/10 border border-brand/20 rounded-lg p-3 flex items-start gap-2">
                  <Shield className="size-4 text-brand shrink-0 mt-0.5" />
                  <div className="text-xs text-brand/80">
                    <p className="font-medium">需 ADMIN 权限</p>
                    <p>解冻后此记忆将重新纳入 AI 自动演化范围。</p>
                  </div>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
              记忆摘要: <span className="text-foreground font-medium">{summary}</span>
            </p>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            取消
          </Button>
          <Button
            variant={frozen ? "default" : "default"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="size-3.5 mr-1 animate-spin" />
                处理中...
              </>
            ) : frozen ? (
              "确认冻结"
            ) : (
              "确认解冻"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
