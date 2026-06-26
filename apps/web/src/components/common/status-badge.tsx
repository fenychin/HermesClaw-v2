"use client";

import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";

/**
 * StatusBadge 支持的所有状态类型
 * —— 覆盖 Agent 运行态、Connector 连接态、Harness 审批态
 */
export type StatusBadgeStatus =
  | "running"
  | "idle"
  | "error"
  | "paused"
  | "connected"
  | "pending"
  | "approved"
  | "rejected"
  | "upgrade"
  | "pending_config"
  | "draft"
  | "canary"
  | "active"
  | "deprecated";

interface StatusBadgeProps {
  status: StatusBadgeStatus;
  /** 可选自定义类名 */
  className?: string;
}

/** 状态 → 显示标签映射 */
const STATUS_LABEL: Record<StatusBadgeStatus, string> = {
  running: "运行中",
  idle: "空闲",
  error: "异常",
  paused: "已暂停",
  connected: "已连接",
  pending: "待审批",
  approved: "已通过",
  rejected: "已驳回",
  upgrade: "可升级",
  pending_config: "待配置",
  draft: "待审批",
  canary: "灰度观察",
  active: "已激活",
  deprecated: "已废弃",
};

/**
 * 通用状态标签组件
 * —— 用于 Agent 卡片、Connector 卡片、Harness 提案等场景
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 whitespace-nowrap",
        /* 运行中：绿色背景 + 脉冲绿点 */
        status === "running" && "bg-success/10 text-success",
        /* 空闲：灰色 */
        status === "idle" && "bg-muted text-hint",
        /* 异常：红色 */
        status === "error" && "bg-danger/10 text-danger",
        /* 已暂停：橙色 */
        status === "paused" && "bg-warning/10 text-warning",
        /* 已连接：绿色 */
        status === "connected" && "bg-success/10 text-success",
        /* 待审批：黄色 */
        status === "pending" && "bg-warning/10 text-warning",
        /* 待配置：黄色 */
        status === "pending_config" && "bg-warning/10 text-warning",
        /* 已通过：绿色 */
        status === "approved" && "bg-success/10 text-success",
        /* 已驳回：红色 */
        status === "rejected" && "bg-danger/10 text-danger",
        /* 可升级：紫色 + Zap 图标 */
        status === "upgrade" && "bg-brand/10 text-brand",
        /* 待审批 (草稿)：黄色 */
        status === "draft" && "bg-warning/10 text-warning",
        /* 灰度观察：天蓝色 */
        status === "canary" && "bg-sky-500/10 text-sky-600",
        /* 已激活：绿色 */
        status === "active" && "bg-success/10 text-success",
        /* 已废弃：灰色 */
        status === "deprecated" && "bg-muted text-hint",
        className,
      )}
    >
      {/* running 状态：绿色脉冲圆点 */}
      {status === "running" ? (
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
      ) : null}
      {/* upgrade 状态：Zap 图标 */}
      {status === "upgrade" ? <Zap className="size-3" /> : null}
      {STATUS_LABEL[status]}
    </span>
  );
}
