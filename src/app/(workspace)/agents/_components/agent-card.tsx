"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { AutomationLevelBadge } from "@/components/common/agent-status-badge";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

interface AgentCardProps {
  id: string;
  name: string;
  role: string;
  status: "active" | "idle" | "error";
  tags: string[];
  taskCount: number;
  isBuiltIn: boolean;
  /** 自动化授权等级（AGENTS.md §4.7） */
  automationLevel?: string;
}

/**
 * 智能体卡片
 * —— 展示智能体头像、基础信息、技能标签、任务数、自动化等级，
 *    并接入 ui-store 中的 SSE 实时执行状态。
 */
export function AgentCard({
  id,
  name,
  role,
  status,
  tags,
  taskCount,
  isBuiltIn,
  automationLevel = "L2",
}: AgentCardProps) {
  // 从 SSE 流更新的 Zustand store 读取实时执行状态
  const sseState = useUiStore((s) => s.agentExecutionStates[id]);
  const sseStatus = sseState?.status;

  // SSE 实时状态覆盖：若 SSE 报告 executing/failed/succeeded，优先展示
  const displayStatus: "active" | "idle" | "error" =
    sseStatus === "executing"
      ? "active"
      : sseStatus === "failed"
        ? "error"
        : sseStatus === "succeeded"
          ? "idle"
          : status;

  // SSE 状态指示色（AGENTS.md §4.8）
  const sseColor =
    sseStatus === "executing"
      ? "text-warning"
      : sseStatus === "failed"
        ? "text-danger"
        : sseStatus === "succeeded"
          ? "text-success"
          : undefined;

  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="bg-card rounded-2xl border border-border p-5 hover:border-primary/40 transition-all flex flex-col gap-4 group">
      {/* 顶部：头像 + 基础信息 + 状态 */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          {/* 渐变圆形头像 + SSE 实时状态环 */}
          <div className="relative flex-shrink-0">
            <div
              className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold",
                "bg-primary/20 text-primary",
              )}
            >
              {initial}
            </div>
            {/* SSE 实时状态圆点（AGENTS.md §4.8） */}
            {sseStatus && sseStatus !== "idle" && (
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 flex size-3.5 rounded-full border-2 border-card",
                  sseStatus === "executing" && "bg-warning",
                  sseStatus === "succeeded" && "bg-success",
                  sseStatus === "failed" && "bg-danger",
                  sseStatus === "cancelled" && "bg-muted-foreground",
                )}
              >
                {sseStatus === "executing" && (
                  <span className="absolute inset-0 rounded-full animate-ping bg-warning opacity-75" />
                )}
              </span>
            )}
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/agents/${id}`}
                className="text-foreground font-medium text-sm hover:text-primary transition-colors truncate"
              >
                {name}
              </Link>
              {isBuiltIn && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md leading-none shrink-0">
                  官方
                </span>
              )}
              {/* 自动化授权等级（AGENTS.md §4.7） */}
              <AutomationLevelBadge level={automationLevel} />
            </div>
            <span className="text-muted-foreground text-xs mt-0.5">{role}</span>
          </div>
        </div>

        {/* 状态标签 + SSE 实时色 */}
        <StatusBadge status={displayStatus === "active" ? "running" : displayStatus} />
      </div>

      {/* SSE 实时任务提示 */}
      {sseState?.currentTask && (
        <div className={cn("-mt-2 text-xs truncate", sseColor)}>
          {sseState.currentTask}
        </div>
      )}

      {/* 中部：技能标签 */}
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="bg-primary/10 text-primary rounded-lg px-2 py-0.5 text-xs"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* 底部：任务数 + 操作 */}
      <div className="flex items-end justify-between mt-auto pt-2">
        <div className="text-hint text-xs">
          已完成 {taskCount} 项任务
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/agents/${id}`}>
            <Button
              variant="outline"
              size="sm"
              className="bg-card border-border h-8 text-xs"
            >
              详情
            </Button>
          </Link>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
          >
            对话
          </Button>
        </div>
      </div>
    </div>
  );
}
