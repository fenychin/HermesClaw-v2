"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  Puzzle,
  Brain,
  ScrollText,
  GitBranch,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types";
import {
  getGradient,
  SOURCE_META,
  LOG_STATUS_META,
  formatDate,
  type AgentRunLog,
} from "@/lib/agent-utils";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/empty-state";
import { SkeletonCard } from "@/components/common/skeleton-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/** 运行时校验 Agent 关键字段，避免 as 强制转换后下游崩溃 */
function isValidAgent(data: unknown): data is Agent {
  if (typeof data !== "object" || data === null) return false;
  const a = data as Record<string, unknown>;
  return (
    typeof a.id === "string" &&
    typeof a.name === "string" &&
    typeof a.role === "string" &&
    typeof a.status === "string" &&
    typeof a.source === "string" &&
    Array.isArray(a.canDo) &&
    Array.isArray(a.cannotDo) &&
    typeof a.stats === "object" &&
    a.stats !== null
  );
}

/** 运行时校验日志条目 */
function isValidLog(data: unknown): data is AgentRunLog {
  if (typeof data !== "object" || data === null) return false;
  const l = data as Record<string, unknown>;
  return (
    typeof l.id === "string" &&
    typeof l.taskName === "string" &&
    typeof l.status === "string" &&
    typeof l.duration === "string" &&
    typeof l.createdAt === "string"
  );
}

/** 智能体详情页 —— 独立骨架，含 Tabs 切换与真实日志 */
export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();

  // 获取智能体数据
  const {
    data: agentData,
    isLoading: agentLoading,
    isError: agentError,
  } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => apiClient.getAgent(id),
    enabled: !!id,
    // select 中做运行时校验，避免 unsafe as 强制转换
    select: (data) => {
      const raw = data?.agent;
      return isValidAgent(raw) ? raw : null;
    },
  });
  const agent = agentData ?? null;

  // 获取运行日志
  const {
    data: logsData,
    isLoading: logsLoading,
    isError: logsError,
  } = useQuery({
    queryKey: ["agent-logs", id],
    queryFn: () => apiClient.getAgentLogs(id),
    enabled: !!id,
    select: (data) => {
      const raw = data?.logs;
      if (!Array.isArray(raw)) return [];
      return raw.filter(isValidLog);
    },
  });
  const runLogs = logsData ?? [];

  // ---- 加载中 ----
  if (agentLoading) {
    return (
      <PageTransition>
        <div className="p-6 space-y-6">
          {/* 页头骨架 */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-4">
              <div className="size-15 shrink-0 rounded-full animate-pulse bg-accent" />
              <div className="flex-1 space-y-2.5">
                <div className="h-6 w-48 animate-pulse rounded-lg bg-accent" />
                <div className="h-4 w-72 animate-pulse rounded-lg bg-accent" />
              </div>
            </div>
            <div className="mt-5 border-t border-border pt-4 flex gap-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-16 animate-pulse rounded bg-accent" />
                  <div className="h-8 w-12 animate-pulse rounded-lg bg-accent" />
                </div>
              ))}
            </div>
          </div>
          {/* Tab 骨架 */}
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} variant="list-item" />
            ))}
          </div>
        </div>
      </PageTransition>
    );
  }

  // ---- 错误 ----
  if (agentError || !agent) {
    return (
      <PageTransition>
        <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <EmptyState
            icon={AlertTriangle}
            title="智能体不存在"
            description="未找到该智能体，请检查 URL 或返回列表页重新选择。"
          />
        </div>
      </PageTransition>
    );
  }

  const initial = agent.name.charAt(0).toUpperCase();
  const sourceMeta = SOURCE_META[agent.source] ?? {
    label: agent.source,
    className: "bg-accent text-muted-foreground",
  };

  /** 启动/暂停操作（骨架阶段仅 toast，后续接入 useAgentStore） */
  const handleToggleStatus = () => {
    const nextStatus = agent.status === "running" ? "paused" : "running";
    toast.info(`智能体状态变更（${nextStatus === "running" ? "启动" : "暂停"}）功能即将上线`);
  };

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        {/* ======== 顶部：头像 + 名称 + 状态 + 操作 ======== */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-start gap-4">
            {/* 渐变圆形头像 */}
            <div
              className={cn(
                "flex size-15 shrink-0 items-center justify-center rounded-full bg-linear-to-br text-xl font-bold text-white",
                getGradient(agent.id),
              )}
            >
              {initial}
            </div>

            {/* 名称 + badges */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h1 className="text-foreground truncate text-xl font-bold">
                  {agent.name}
                </h1>
                <StatusBadge status={agent.status} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {/* role */}
                <span className="bg-accent text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                  {agent.role}
                </span>
                {/* source */}
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    sourceMeta.className,
                  )}
                >
                  {sourceMeta.label}
                </span>
                {/* harness version */}
                <span className="bg-accent text-hint rounded-full px-2.5 py-0.5 text-xs font-mono">
                  v{agent.harnessVersion}
                </span>
              </div>
              {/* description */}
              <p className="text-muted-foreground text-sm mt-2 leading-relaxed line-clamp-2">
                {agent.description}
              </p>
            </div>

            {/* 右侧操作按钮 */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleToggleStatus}
                className={
                  agent.status === "running"
                    ? "border-warning text-warning hover:bg-warning/10 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                    : "border-success text-success hover:bg-success/10 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                }
              >
                {agent.status === "running" ? (
                  <>
                    <Pause className="size-3.5" />
                    暂停
                  </>
                ) : (
                  <>
                    <Play className="size-3.5" />
                    启动
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ======== 运行统计栏 ======== */}
          <div className="border-border mt-5 flex items-center gap-8 border-t pt-4">
            <div>
              <p className="text-hint text-xs">今日任务数</p>
              <p className="text-foreground mt-0.5 text-2xl font-semibold tabular-nums">
                {agent.stats.todayTasks}
              </p>
            </div>
            <div>
              <p className="text-hint text-xs">成功率</p>
              <p className="text-success mt-0.5 text-2xl font-semibold tabular-nums">
                {(agent.stats.successRate * 100).toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-hint text-xs">平均耗时</p>
              <p className="text-foreground mt-0.5 text-2xl font-semibold tabular-nums">
                {agent.stats.avgDuration}
              </p>
            </div>
          </div>
        </div>

        {/* ======== Tab 切换 ======== */}
        <Tabs defaultValue="overview">
          <TabsList variant="line" className="mb-5">
            <TabsTrigger value="overview">
              <Bot className="size-4" />
              概览
            </TabsTrigger>
            <TabsTrigger value="skills">
              <Puzzle className="size-4" />
              技能绑定
            </TabsTrigger>
            <TabsTrigger value="memory">
              <Brain className="size-4" />
              记忆权限
            </TabsTrigger>
            <TabsTrigger value="logs">
              <ScrollText className="size-4" />
              运行日志
            </TabsTrigger>
            <TabsTrigger value="harness">
              <GitBranch className="size-4" />
              Harness 版本
            </TabsTrigger>
          </TabsList>

          {/* ======== 概览 Tab ======== */}
          <TabsContent value="overview" className="space-y-6">
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-foreground text-sm font-semibold mb-3">能力范围</h3>
              <ul className="space-y-2">
                {agent.canDo.map((item, i) => (
                  <li key={i} className="text-muted-foreground flex items-start gap-2 text-sm">
                    <CheckCircle2 className="text-success mt-0.5 size-3.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-foreground text-sm font-semibold mb-3">能力边界</h3>
              <ul className="space-y-2">
                {agent.cannotDo.map((item, i) => (
                  <li key={i} className="text-hint flex items-start gap-2 text-sm">
                    <AlertTriangle className="text-danger mt-0.5 size-3.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>

          {/* ======== 技能绑定 Tab ======== */}
          <TabsContent value="skills">
            <EmptyState
              icon={Puzzle}
              title="技能绑定管理"
              description="在此管理该智能体绑定的行业技能、岗位技能与自定义技能。支持版本选择、优先级排序与启用/禁用控制。该功能将在后续版本中上线。"
            />
          </TabsContent>

          {/* ======== 记忆权限 Tab ======== */}
          <TabsContent value="memory">
            <EmptyState
              icon={Brain}
              title="记忆权限配置"
              description={
                agent.memoryPermission === "read-write"
                  ? "当前权限：读写 — 智能体可读取相关记忆并写入新的经验。详细的记忆区分、权限粒度与审计策略将在后续版本中提供。"
                  : agent.memoryPermission === "read"
                    ? "当前权限：只读 — 智能体仅可读取相关记忆。详细的记忆区分、权限粒度与审计策略将在后续版本中提供。"
                    : "当前权限：无 — 智能体不可访问记忆系统。详细的记忆区分、权限粒度与审计策略将在后续版本中提供。"
              }
            />
          </TabsContent>

          {/* ======== 运行日志 Tab（真实数据） ======== */}
          <TabsContent value="logs">
            {logsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} variant="list-item" />
                ))}
              </div>
            ) : logsError ? (
              <div className="border-danger/30 bg-danger/5 flex items-center gap-2 rounded-xl border px-4 py-3">
                <AlertTriangle className="text-danger size-4 shrink-0" />
                <p className="text-danger text-sm">运行日志加载失败，请稍后重试</p>
              </div>
            ) : runLogs.length > 0 ? (
              <div className="border-border overflow-hidden rounded-xl border">
                {runLogs.map((log, i) => {
                  const statusMeta = LOG_STATUS_META[log.status] ?? {
                    label: log.status,
                    className: "text-warning bg-warning/10",
                  };
                  return (
                    <div
                      key={log.id}
                      className={cn(
                        "border-border flex items-center gap-3 px-4 py-2.5 font-mono text-xs",
                        i < runLogs.length - 1 && "border-b",
                      )}
                    >
                      {/* 时间戳 */}
                      <span className="text-hint shrink-0 w-30">
                        {formatDate(log.createdAt)}
                      </span>
                      {/* 任务简述 */}
                      <span className="text-muted-foreground min-w-0 flex-1 truncate">
                        {log.detail || log.taskName}
                      </span>
                      {/* 状态 badge */}
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                          statusMeta.className,
                        )}
                      >
                        {statusMeta.label}
                      </span>
                      {/* 风险等级 */}
                      {log.riskLevel && (
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                            log.riskLevel === "high"
                              ? "text-danger bg-danger/10"
                              : log.riskLevel === "medium"
                                ? "text-warning bg-warning/10"
                                : "text-success bg-success/10",
                          )}
                        >
                          {log.riskLevel === "high" ? "高风险" : log.riskLevel === "medium" ? "中风险" : "低风险"}
                        </span>
                      )}
                      {/* 耗时 */}
                      <span className="text-hint w-18 shrink-0 text-right">
                        {log.duration}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={ScrollText}
                title="暂无运行日志"
                description="该智能体执行任务后，运行日志将在此留痕。日志用于 Harness 健康评估与版本升级决策。"
              />
            )}
          </TabsContent>

          {/* ======== Harness 版本 Tab ======== */}
          <TabsContent value="harness" className="space-y-5">
            {/* 当前版本 */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-foreground text-sm font-semibold">当前 Harness 版本</h3>
                  <p className="text-hint text-xs mt-1">
                    创建于 {formatDate(agent.createdAt)} · 最近活跃 {formatDate(agent.lastActive)}
                  </p>
                </div>
                <span className="bg-brand/10 text-brand rounded-lg px-3 py-1.5 text-sm font-mono font-semibold">
                  v{agent.harnessVersion}
                </span>
              </div>
            </div>

            {/* 版本管理（占位） */}
            <EmptyState
              icon={GitBranch}
              title="Harness 版本管理"
              description="Harness 六大组件（任务边界、上下文供给、工具接入、反馈回路、安全护栏、进化调度器）的版本历史、变更记录与升级建议。Phase 2 将提供完整的 Harness 自演化控制台。"
            />

            {/* 升级建议（占位） */}
            <EmptyState
              icon={Clock}
              title="升级建议"
              description="基于运行日志与失败率指标，Harness 自演化引擎将自动生成升级提案。升级审批流程已于 Settings → Harness 审批 中实现。"
            />
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  );
}
