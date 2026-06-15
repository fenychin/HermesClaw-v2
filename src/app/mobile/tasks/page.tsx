// ⚠️ MOBILE PREVIEW — PRD §9.3 暂缓项，UI 在 fixture 数据上演示
"use client";

import { useState } from "react";
import {
  ClipboardList,
  Clock,
  MapPin,
  User,
  ChevronRight,
  Circle,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOCK_TASKS, type MobileTask, type MobileTaskStatus as TaskStatus } from "../_fixtures/mock-tasks";

/** 状态徽标配置 */
const statusConfig: Record<
  TaskStatus,
  { label: string; icon: typeof Circle; className: string }
> = {
  pending: {
    label: "待执行",
    icon: Circle,
    className: "text-muted-foreground",
  },
  in_progress: {
    label: "执行中",
    icon: Loader2,
    className: "text-warning",
  },
  completed: {
    label: "已完成",
    icon: CheckCircle2,
    className: "text-success",
  },
  blocked: {
    label: "已阻塞",
    icon: AlertCircle,
    className: "text-danger",
  },
};

/** 模拟任务数据已迁移至 ../_fixtures/mock-tasks.ts */

/** 按状态排序：in_progress → pending → blocked → completed */
function sortTasks(tasks: MobileTask[]): MobileTask[] {
  const order: Record<TaskStatus, number> = {
    in_progress: 0,
    pending: 1,
    blocked: 2,
    completed: 3,
  };
  return [...tasks].sort((a, b) => order[a.status] - order[b.status]);
}

/**
 * 移动端待执行任务列表页
 * —— 外勤销售查看、筛选、执行任务的入口
 */
export default function MobileTasksPage() {
  const [tasks] = useState<MobileTask[]>(sortTasks(MOCK_TASKS));
  const [filter, setFilter] = useState<TaskStatus | "all">("all");

  const filtered =
    filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const pendingCount = tasks.filter(
    (t) => t.status === "pending" || t.status === "in_progress",
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-lg font-semibold tracking-tight">
            待执行任务
          </h1>
          <p className="text-hint text-xs mt-0.5">
            {pendingCount > 0
              ? `${pendingCount} 项待处理`
              : "所有任务已完成"}
          </p>
        </div>
        <div className="bg-card rounded-full px-3 py-1.5 text-xs text-muted-foreground">
          今日
        </div>
      </div>

      {/* 状态过滤栏 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {(
          [
            { key: "all", label: "全部" },
            { key: "pending", label: "待执行" },
            { key: "in_progress", label: "执行中" },
            { key: "blocked", label: "已阻塞" },
            { key: "completed", label: "已完成" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium min-h-11 flex items-center",
              "transition-colors touch-manipulation",
              filter === key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {key === "pending" && pendingCount > 0 && (
              <span className="ml-1 bg-primary-foreground/20 rounded-full px-1.5 text-xs">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 任务列表 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="size-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground text-sm">暂无此类任务</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((task) => {
            const status = statusConfig[task.status];
            const StatusIcon = status.icon;

            return (
              <button
                key={task.id}
                type="button"
                className={cn(
                  "bg-card rounded-2xl p-4 text-left w-full",
                  "border border-border/50 transition-colors",
                  "active:bg-accent touch-manipulation",
                  "flex items-start gap-3",
                )}
              >
                {/* 状态图标 */}
                <div className="shrink-0 mt-0.5">
                  <StatusIcon
                    className={cn(
                      "size-5",
                      status.className,
                      task.status === "in_progress" && "animate-spin",
                    )}
                  />
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3
                      className={cn(
                        "text-foreground text-sm font-medium truncate",
                        task.status === "completed" && "line-through opacity-60",
                      )}
                    >
                      {task.title}
                    </h3>
                    {task.priority === "high" && (
                      <span className="shrink-0 bg-danger/15 text-danger rounded-full px-1.5 text-[10px] font-medium">
                        高
                      </span>
                    )}
                  </div>

                  <p className="text-hint text-xs line-clamp-2 mb-2">
                    {task.description}
                  </p>

                  {/* 元信息行 */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="size-3" />
                      {task.customer}
                    </span>
                    {task.location && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="size-3 shrink-0" />
                        <span className="truncate">{task.location}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-1.5">
                    {task.dueTime && (
                      <span
                        className={cn(
                          "flex items-center gap-1 text-xs",
                          task.status === "completed"
                            ? "text-success"
                            : "text-warning",
                        )}
                      >
                        <Clock className="size-3" />
                        {task.dueTime}
                      </span>
                    )}
                    <span className="bg-accent rounded-full px-2 py-0.5 text-[10px] text-muted-foreground">
                      {status.label}
                    </span>
                  </div>
                </div>

                {/* 箭头 */}
                <ChevronRight className="size-4 text-muted-foreground/40 shrink-0 mt-1" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
