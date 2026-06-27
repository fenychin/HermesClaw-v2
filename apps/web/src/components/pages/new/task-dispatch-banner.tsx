"use client";

import Link from "next/link";
import { X, FileCode, AlertTriangle, ExternalLink } from "lucide-react";

interface TaskDispatchBannerProps {
  taskId: string;
  workflowRunId: string;
  actionType: string;
  riskLevel: string;
  automationLevel: string;
  fallback?: boolean;
  /** dispatch → completed 耗时（毫秒） */
  durationMs?: number;
  onDismiss?: () => void;
}

const automationBadge: Record<string, { label: string; color: string }> = {
  L1: { label: "L1 全自动", color: "bg-muted text-muted-foreground" },
  L2: { label: "L2 建议执行", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  L3: { label: "L3 需确认", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  L4: { label: "L4 禁止自动", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const riskBadge: Record<string, { label: string; color: string }> = {
  low: { label: "低风险", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  medium: { label: "中风险", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  high: { label: "高风险", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  critical: { label: "严重风险", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 任务分发状态横幅 — 提交后回显 taskId + automationLevel + riskLevel + 执行证据
 *
 * 用于在 ConversationArea 顶部展示当前对话绑定的任务信息，
 * 满足 PRD §10.2 验收标准：提交后页面能看到 taskId。
 */
export function TaskDispatchBanner({
  taskId,
  workflowRunId,
  actionType,
  riskLevel,
  automationLevel,
  fallback,
  durationMs,
  onDismiss,
}: TaskDispatchBannerProps) {
  const aMeta = automationBadge[automationLevel] ?? automationBadge.L2;
  const rMeta = riskBadge[riskLevel] ?? riskBadge.low;

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm shadow-sm">
      {/* 左侧图标 */}
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <FileCode className="size-4 text-primary" />
      </div>

      {/* 中间内容 */}
      <div className="min-w-0 flex-1 space-y-1.5">
        {/* 第一行：标题 + 标签 + 执行耗时 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">
            {fallback ? "手动模式任务" : `任务已分发 · ${actionType}`}
          </span>
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${aMeta.color}`}>
            {aMeta.label}
          </span>
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${rMeta.color}`}>
            {rMeta.label}
          </span>
          {fallback && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <AlertTriangle className="size-2.5" />
              意图降级
            </span>
          )}
          {durationMs !== undefined && durationMs > 0 && (
            <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {formatDuration(durationMs)}
            </span>
          )}
        </div>

        {/* 第二行：ID 信息（可复制）+ 跳转链接 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <button
            type="button"
            className="inline-flex items-center gap-1 font-mono hover:text-foreground transition-colors cursor-pointer"
            onClick={() => navigator.clipboard.writeText(taskId)}
            title="点击复制 taskId"
          >
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">任务</span>
            <span>{taskId.slice(0, 8)}…</span>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-mono hover:text-foreground transition-colors cursor-pointer"
            onClick={() => navigator.clipboard.writeText(workflowRunId)}
            title="点击复制 workflowRunId"
          >
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">执行</span>
            <span>{workflowRunId.slice(0, 12)}…</span>
          </button>
          <span className="text-[10px] text-muted-foreground/50">点击复制</span>

          {/* 分隔 · 跳转链接 */}
          <span className="text-[10px] text-border select-none">|</span>
          <Link
            href="/settings/harness"
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="size-2.5" />
            审批
          </Link>
        </div>
      </div>

      {/* 右侧关闭按钮 */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
