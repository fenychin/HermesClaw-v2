"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, AlertTriangle } from "lucide-react";

interface RiskConfirmDialogProps {
  open: boolean;
  riskLevel: string;
  automationLevel: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * L3 风险确认弹窗
 *
 * 用于高风险操作（L3 automationLevel）的二次确认。
 * 用户必须显式点击"确认执行"后才能继续 dispatch。
 *
 * AGENTS.md §4.5: 高危操作需二次确认
 */
export function RiskConfirmDialog({
  open,
  riskLevel,
  automationLevel,
  message,
  onConfirm,
  onCancel,
}: RiskConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <ShieldAlert className="size-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <AlertDialogTitle className="text-base">
                高风险操作确认
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-0.5">
                自动化等级:{" "}
                <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                  {automationLevel}
                </span>
                {" · "}
                风险等级:{" "}
                <span className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                  {riskLevel}
                </span>
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-900/10">
          <div className="flex gap-2">
            <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-px" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {message}
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
          >
            确认执行
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
