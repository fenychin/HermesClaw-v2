"use client";

import { memo, useMemo } from "react";
import {
  Lock,
  Trash2,
  Snowflake,
  Calendar,
  GitBranch,
  ExternalLink,
  Shield,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Memory } from "@/types";

interface MemoryCardProps {
  memory: Memory;
  onViewRevisions: (m: Memory) => void;
  onDelete: (id: string) => void;
  onFreeze: (id: string, frozen: boolean, summary: string) => void;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.9) return "text-success";
  if (confidence >= 0.7) return "text-warning";
  return "text-danger";
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");
  return `${month}月${day}日 ${hour}:${minute}`;
}

/**
 * 记忆卡片 — 展示版本号、来源 taskId、冻结状态、置信度
 * —— 所有关键状态可见：taskId / version / frozen / confidence
 */
export const MemoryCard = memo(function MemoryCard({
  memory,
  onViewRevisions,
  onDelete,
  onFreeze,
}: MemoryCardProps) {
  const displayTime = useMemo(() => {
    if (memory.updatedAt && memory.updatedAt !== memory.createdAt) {
      return `更新于: ${formatTime(memory.updatedAt)}`;
    }
    return formatTime(memory.createdAt);
  }, [memory]);

  const friendlySource = useMemo(() => {
    if (memory.taskId) return `任务: ${memory.taskId.slice(0, 8)}...`;
    if (memory.relatedAgent) return `智能体: ${memory.relatedAgent}`;
    if (memory.relatedProject) return `项目: ${memory.relatedProject}`;
    if (memory.source === "manual" || memory.source === "user") return "人工录入";
    if (memory.source === "system") return "自演化引擎";
    return memory.source === "auto" ? "工作流捕获" : memory.source;
  }, [memory]);

  const hasTaskSource = !!(memory.taskId || memory.workflowRunId);

  return (
    <div
      className={cn(
        "bg-card border-border rounded-xl border p-4 flex flex-col justify-between min-h-[168px] text-left",
        memory.frozen && "ring-1 ring-amber-500/30"
      )}
    >
      <div>
        {/* 顶栏：时间 · 来源 · 版本 · 置信度 · 冻结标志 */}
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span className="text-muted-foreground shrink-0 text-xs">
            {displayTime}
          </span>
          <span className="bg-accent text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium max-w-[140px] truncate">
            {friendlySource}
          </span>
          {memory.version && memory.version > 1 ? (
            <button
              type="button"
              onClick={() => onViewRevisions(memory)}
              className="bg-brand/10 text-brand hover:bg-brand/20 rounded-full px-2 py-0.5 text-[10px] font-mono font-medium transition-colors cursor-pointer"
              title="点击查看版本历史"
            >
              v{memory.version}
            </button>
          ) : (
            <span className="bg-accent text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-mono">
              v{memory.version ?? 1}
            </span>
          )}
          <div className="flex-1" />
          <span
            className={cn(
              "shrink-0 text-xs font-medium",
              confidenceColor(memory.confidence),
            )}
            title={`置信度: ${Math.round(memory.confidence * 100)}%`}
          >
            {Math.round(memory.confidence * 100)}%
          </span>
          {memory.frozen && (
            <Shield className="text-amber-500 size-3.5 shrink-0" />
          )}
        </div>

        {/* 摘要 */}
        <p className="text-foreground mb-2 line-clamp-2 text-sm leading-relaxed font-medium">
          {memory.summary}
        </p>

        {/* 内容预览（非短期记忆） */}
        {memory.content && memory.type !== "short" && (
          <p className="text-muted-foreground mb-2 line-clamp-2 text-xs leading-relaxed">
            {memory.content}
          </p>
        )}

        {/* 标签 */}
        {memory.tags && memory.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {memory.tags.map((tag) => (
              <span
                key={tag}
                className="bg-accent text-hint rounded-md px-2 py-0.5 text-[10px]"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* 来源任务链接 */}
        {hasTaskSource && (
          <div className="mb-2 flex items-center gap-2 text-[10px]">
            <GitBranch className="size-3 text-muted-foreground" />
            {memory.workflowRunId ? (
              <a
                href={`/workspace/workflows/${memory.workflowRunId}`}
                className="text-brand hover:underline inline-flex items-center gap-1"
                target="_blank"
                rel="noopener noreferrer"
              >
                工作流运行
                <ExternalLink className="size-2.5" />
              </a>
            ) : null}
            {memory.taskId && (
              <a
                href={`/workspace/tasks/${memory.taskId}`}
                className="text-brand/80 hover:text-brand hover:underline inline-flex items-center gap-1"
              >
                taskId: {memory.taskId.slice(0, 12)}...
                <ExternalLink className="size-2.5" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* 底栏：操作按钮 */}
      <div className="border-border flex items-center gap-1 border-t pt-2.5 mt-2 flex-wrap">
        {/* 查看版本历史（中长期记忆） */}
        {(memory.type === "mid" || memory.type === "long") && (
          <button
            type="button"
            onClick={() => onViewRevisions(memory)}
            className="text-brand hover:bg-brand/10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors"
          >
            <Calendar className="size-3" />
            修订历史
            {(memory.revisions?.length ?? 0) > 0 && (
              <span className="text-[9px]">({memory.revisions?.length})</span>
            )}
          </button>
        )}

        {/* 冻结/解冻 */}
        <button
          type="button"
          onClick={() => onFreeze(memory.id, !memory.frozen, memory.summary)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
            memory.frozen
              ? "text-amber-500 hover:bg-amber-500/10"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
          title={memory.frozen ? "解冻此记忆" : "冻结此记忆（需 ADMIN 权限）"}
        >
          {memory.frozen ? (
            <>
              <Lock className="size-3" />
              解冻
            </>
          ) : (
            <>
              <Snowflake className="size-3" />
              冻结
            </>
          )}
        </button>

        <div className="flex-1" />

        {/* 删除 */}
        <button
          type="button"
          onClick={() => onDelete(memory.id)}
          className="text-danger hover:bg-danger/10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors font-medium"
        >
          <Trash2 className="size-3" />
          删除
        </button>
      </div>
    </div>
  );
});
