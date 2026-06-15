"use client";

import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Workflow, WorkflowStep, WorkflowStepStatus } from "@/types/workflow";

// ============================================================
// 步骤圆点颜色映射
// ============================================================

/** 根据步骤状态返回圆点样式类 */
function getDotClass(status: WorkflowStepStatus): string {
  switch (status) {
    case "completed":
      return "bg-success";
    case "running":
      return "bg-primary animate-pulse";
    case "failed":
      return "bg-danger";
    case "pending":
    default:
      return "bg-border";
  }
}

/** 根据步骤状态返回状态文字 */
function getStatusLabel(status: WorkflowStepStatus): string {
  switch (status) {
    case "completed":
      return "已完成";
    case "running":
      return "执行中";
    case "failed":
      return "执行失败";
    case "pending":
    default:
      return "待执行";
  }
}

/** 根据步骤状态返回状态文字颜色 */
function getStatusTextClass(status: WorkflowStepStatus): string {
  switch (status) {
    case "completed":
      return "text-success";
    case "running":
      return "text-primary";
    case "failed":
      return "text-danger";
    case "pending":
    default:
      return "text-hint";
  }
}

// ============================================================
// 单个步骤行
// ============================================================

interface StepRowProps {
  step: WorkflowStep;
  /** 是否为最后一步（不渲染连接线） */
  isLast: boolean;
}

function StepRow({ step, isLast }: StepRowProps) {
  return (
    <div className="flex gap-3">
      {/* 左侧时间线轨道：圆点 + 连接线 */}
      <div className="flex flex-col items-center">
        {/* 圆点 */}
        <div
          className={cn(
            "mt-0.5 size-3.5 rounded-full shrink-0 ring-2 ring-background",
            getDotClass(step.status),
          )}
        />
        {/* 连接线（最后一步不渲染） */}
        {!isLast && (
          <div className="border-l border-border ml-[1px] mt-1 flex-1 min-h-[24px]" />
        )}
      </div>

      {/* 右侧步骤内容 */}
      <div className={cn("pb-4 min-w-0", isLast && "pb-0")}>
        {/* 步骤名称 */}
        <p
          className={cn(
            "text-sm leading-snug",
            step.status === "pending"
              ? "text-muted-foreground"
              : "text-foreground font-medium",
          )}
        >
          {step.title}
        </p>
        {/* 步骤状态文字 */}
        <p className={cn("text-xs mt-0.5", getStatusTextClass(step.status))}>
          {getStatusLabel(step.status)}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// WorkflowStepNav 主组件
// ============================================================

interface WorkflowStepNavProps {
  workflow: Workflow;
  /** 点击「重新执行」回调 */
  onRestart?: () => void;
}

/**
 * 工作流步骤导航（左栏）
 * —— 垂直时间线样式，顶部返回按钮 + 工作流名称，底部「重新执行」按钮
 */
export function WorkflowStepNav({ workflow, onRestart }: WorkflowStepNavProps) {
  return (
    <aside className="w-56 shrink-0 h-full flex flex-col bg-sidebar border-r border-border">
      {/* 顶部：返回链接 + 工作流名称 */}
      <div className="p-4 border-b border-border/40 shrink-0">
        {/* 返回外贸首页 */}
        <Link
          href="/foreign-trade"
          className={cn(
            "flex items-center gap-1.5 text-hint text-xs mb-3",
            "hover:text-muted-foreground transition-colors group",
          )}
        >
          <ArrowLeft className="size-3 transition-transform group-hover:-translate-x-0.5" />
          外贸工作台
        </Link>

        {/* 工作流名称 */}
        <h2 className="text-foreground text-sm font-semibold leading-snug">
          {workflow.title}
        </h2>
        <p className="text-hint text-xs mt-0.5 leading-relaxed line-clamp-2">
          {workflow.description}
        </p>
      </div>

      {/* 步骤时间线列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-hint text-[10px] font-semibold uppercase tracking-wider mb-4">
          执行步骤
        </p>
        <div>
          {workflow.steps.map((step, idx) => (
            <StepRow
              key={step.id}
              step={step}
              isLast={idx === workflow.steps.length - 1}
            />
          ))}
        </div>
      </div>

      {/* 底部：重新执行按钮 */}
      <div className="p-4 border-t border-border/40 shrink-0">
        <button
          type="button"
          onClick={onRestart}
          className={cn(
            "w-full flex items-center justify-center gap-2",
            "bg-card border border-border rounded-xl px-3 py-2",
            "text-muted-foreground text-xs hover:text-foreground",
            "hover:border-border/80 transition-all duration-150",
          )}
        >
          <RotateCcw className="size-3" />
          重新执行
        </button>
      </div>
    </aside>
  );
}
