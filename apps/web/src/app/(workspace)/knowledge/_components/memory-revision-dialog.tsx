"use client";

import { memo } from "react";
import { GitBranch, User, FileText, Clock, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Memory, MemoryRevision } from "@/types";

interface MemoryRevisionDialogProps {
  memory: Memory;
  revisions: MemoryRevision[];
  loading?: boolean;
  open: boolean;
  onClose: () => void;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const y = date.getFullYear();
  const M = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${y}-${M}-${d} ${h}:${m}`;
}

/**
 * 记忆修订历史 Dialog — 展示完整 KCL 版本链
 * —— 每条 revision 显示版本号、内容摘要、修改人、原因、时间
 */
export const MemoryRevisionDialog = memo(function MemoryRevisionDialog({
  memory,
  revisions,
  loading,
  open,
  onClose,
}: MemoryRevisionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(opened) => !opened && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="size-4 text-brand" />
            修订演化历史
          </DialogTitle>
          <DialogDescription className="text-left">
            <span className="block text-xs text-muted-foreground">
              记忆: {memory.summary}
            </span>
            <span className="block text-[11px] text-hint mt-1">
              当前版本: v{memory.version ?? 1} · 类型: {memory.type} · 来源: {memory.source}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto py-2 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">加载版本历史...</span>
            </div>
          ) : revisions.length > 0 ? (
            <div className="space-y-3">
              {revisions.map((rev, index) => (
                <div
                  key={rev.id || index}
                  className={cn(
                    "border-l-2 pl-3 py-1.5 space-y-1.5 relative",
                    index === 0 ? "border-brand" : "border-border"
                  )}
                >
                  {/* 版本号 + 时间 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={index === 0 ? "default" : "secondary"}
                        className="px-1.5 py-0 text-[10px] font-mono"
                      >
                        v{rev.version}
                      </Badge>
                      {index === 0 && (
                        <span className="text-[9px] text-brand font-medium">当前</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="size-2.5" />
                      {formatTime(rev.createdAt)}
                    </span>
                  </div>

                  {/* 摘要 */}
                  <p className="text-xs font-semibold text-foreground leading-relaxed">
                    {rev.summary}
                  </p>

                  {/* 内容片段 */}
                  {rev.content && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                      {rev.content}
                    </p>
                  )}

                  {/* 元信息 */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-hint">
                    <span className="inline-flex items-center gap-1">
                      <User className="size-2.5" />
                      操作者: {rev.editedBy || "system"}
                    </span>
                    {rev.reason && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="size-2.5" />
                        原因: {rev.reason}
                      </span>
                    )}
                    {rev.proposalId && (
                      <span className="inline-flex items-center gap-1 text-brand">
                        提案: {rev.proposalId.slice(0, 8)}...
                      </span>
                    )}
                  </div>

                  {/* 置信度变化 */}
                  {rev.confidence !== undefined && (
                    <div className="text-[9px] text-hint">
                      置信度: {Math.round(rev.confidence * 100)}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">暂无历史版本记录</p>
              <p className="text-[10px] text-hint mt-1">
                创建记忆时自动生成初始版本 (v1)
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
