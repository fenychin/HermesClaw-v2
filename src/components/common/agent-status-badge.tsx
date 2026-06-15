"use client";

import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { useOpenClawStream } from "@/hooks/use-openclaw-stream";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  MinusCircle,
} from "lucide-react";

/**
 * AgentStatusBadge
 * —— 接入 OpenClaw SSE 实时事件流（AGENTS.md §4.8），展示智能体执行状态指示色。
 *
 * 状态映射（遵守 CLAUDE.md 颜色系统）：
 *   executing → text-warning (#F0A43B)
 *   succeeded → text-success (#37C99A)
 *   failed    → text-danger  (#FF6B6B)
 *   cancelled / idle → text-muted-foreground (#A1A1AA)
 */

/** AgentSSEStatus 定义所有可能的 SSE 执行状态 */
export type AgentSSEStatus = "executing" | "succeeded" | "failed" | "cancelled" | "idle";

/** 状态 → { label, icon, className } 常量映射 */
const STATUS_DISPLAY: Record<
  AgentSSEStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  executing: {
    label: "执行中",
    icon: Loader2,
    className: "text-warning",
  },
  succeeded: {
    label: "已完成",
    icon: CheckCircle2,
    className: "text-success",
  },
  failed: {
    label: "失败",
    icon: XCircle,
    className: "text-danger",
  },
  cancelled: {
    label: "已取消",
    icon: MinusCircle,
    className: "text-muted-foreground",
  },
  idle: {
    label: "空闲",
    icon: Circle,
    className: "text-muted-foreground",
  },
};

interface AgentStatusBadgeProps {
  /** 智能体 ID（用于订阅对应 SSE 事件流） */
  agentId: string;
  /** 可选自定义类名 */
  className?: string;
  /** 是否显示脉冲动画（仅 executing 状态） */
  showPulse?: boolean;
  /** 是否显示标签文本 */
  showLabel?: boolean;
}

/**
 * SSE 驱动的智能体执行状态标签组件
 * —— 订阅 /api/openclaw/events 事件流，实时更新状态指示。
 *
 * 使用示例：
 *   <AgentStatusBadge agentId="agent-001" showLabel />
 */
export function AgentStatusBadge({
  agentId,
  className,
  showPulse = true,
  showLabel = true,
}: AgentStatusBadgeProps) {
  // 订阅 SSE 事件流（自动更新 Zustand agentExecutionStates）
  useOpenClawStream({ agentId });

  // 从 store 读取执行状态
  const execState = useUiStore(
    (s) => s.agentExecutionStates[agentId],
  );

  const status: AgentSSEStatus = execState?.status ?? "idle";
  const { label, icon: Icon, className: colorClass } = STATUS_DISPLAY[status];

  // 脉冲动画仅 executing 状态显示
  const shouldPulse = showPulse && status === "executing";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        colorClass === "text-warning" && "bg-warning/10",
        colorClass === "text-success" && "bg-success/10",
        colorClass === "text-danger" && "bg-danger/10",
        colorClass === "text-muted-foreground" && "bg-muted/50",
        className,
      )}
      title={`${label}${execState?.currentTask ? ` — ${execState.currentTask}` : ""}`}
    >
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          shouldPulse && "animate-spin",
          colorClass,
        )}
      />
      {showLabel && (
        <span className={colorClass}>{label}</span>
      )}
    </span>
  );
}

/**
 * AgentSSERawStatusBadge
 * —— 不订阅 SSE 流的纯展示变体，由父组件传入已知状态。
 */
interface AgentSSERawStatusBadgeProps {
  status: AgentSSEStatus;
  className?: string;
  showLabel?: boolean;
}

export function AgentSSERawStatusBadge({
  status,
  className,
  showLabel = true,
}: AgentSSERawStatusBadgeProps) {
  const { label, icon: Icon, className: colorClass } = STATUS_DISPLAY[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        colorClass === "text-warning" && "bg-warning/10",
        colorClass === "text-success" && "bg-success/10",
        colorClass === "text-danger" && "bg-danger/10",
        colorClass === "text-muted-foreground" && "bg-muted/50",
        className,
      )}
    >
      <Icon
        className={cn("size-3.5 shrink-0", colorClass)}
      />
      {showLabel && <span className={colorClass}>{label}</span>}
    </span>
  );
}

/**
 * L1-L4 自动化授权等级标签（AGENTS.md §4.7）
 * —— 展示智能体的自动化授权等级，L4 高风险红色、L3 黄色、L2 默认蓝、L1 绿色。
 */
export const AUTOMATION_LEVEL_META: Record<
  string,
  { label: string; short: string; className: string; desc: string }
> = {
  L1: {
    label: "全自动执行",
    short: "L1",
    className: "bg-success/10 text-success border-success/20",
    desc: "无需审批，直接执行",
  },
  L2: {
    label: "建议执行",
    short: "L2",
    className: "bg-brand-blue/10 text-brand-blue border-brand-blue/20",
    desc: "可自动执行，系统留痕可审查",
  },
  L3: {
    label: "需人工确认",
    short: "L3",
    className: "bg-warning/10 text-warning border-warning/20",
    desc: "高风险操作需人工二次确认",
  },
  L4: {
    label: "绝对禁止自动",
    short: "L4",
    className: "bg-danger/10 text-danger border-danger/20",
    desc: "永不自动执行，须人工发起",
  },
};

interface AutomationLevelBadgeProps {
  level: string;
  className?: string;
  showDesc?: boolean;
}

export function AutomationLevelBadge({
  level,
  className,
  showDesc = false,
}: AutomationLevelBadgeProps) {
  const meta = AUTOMATION_LEVEL_META[level] ?? {
    label: level,
    short: level,
    className: "bg-muted/50 text-muted-foreground border-border",
    desc: "",
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "rounded-full border px-2 py-0.5 text-[10px] font-mono font-bold",
          meta.className,
        )}
        title={meta.desc || undefined}
      >
        {meta.short}
      </span>
      {showDesc && (
        <span className="text-hint text-xs">{meta.desc}</span>
      )}
    </span>
  );
}
