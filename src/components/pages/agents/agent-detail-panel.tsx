"use client";

import { useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  Puzzle,
  Search,
  AlertTriangle,
  Play,
  Pause,
  Pencil,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { useAgentStore } from "@/stores/agent-store";
import { useTradeStore } from "@/stores/trade-store";
import { useSkillStore } from "@/stores/skill-store";
import { useConnectorStore } from "@/stores/connector-store";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { RiskBadge } from "@/components/common/risk-badge";
import { AutomationBadge } from "@/components/common/automation-badge";
import { SkeletonCard } from "@/components/common/skeleton-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TRADE_ACTIONS } from "@/types";
import type { Agent, AutomationLevel } from "@/types";

/** 智能体运行日志条目（来自 /api/agents/[id] 的 runLogs） */
interface AgentRunLog {
  id: string;
  taskName: string;
  status: string;
  duration: string;
  detail: string | null;
  source: string;
  createdAt: string;
}

/** 根据 agent.id 选择渐变色的头像背景（与 AgentCard 保持一致的算法） */
const GRADIENT_PRESETS = [
  "from-brand to-brand-blue",
  "from-brand-blue to-success",
  "from-success to-brand",
  "from-warning to-danger",
  "from-danger to-brand",
  "from-brand to-warning",
  "from-brand-blue to-warning",
  "from-success to-brand-blue",
];

function getGradient(agentId: string): string {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = agentId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENT_PRESETS.length;
  return GRADIENT_PRESETS[index]!;
}

/** source → 显示标签与颜色 */
const SOURCE_META: Record<
  Agent["source"],
  { label: string; className: string }
> = {
  builtin: { label: "内置", className: "bg-brand-blue/10 text-brand-blue" },
  custom: { label: "自定义", className: "bg-brand/10 text-brand" },
  industry: { label: "行业", className: "bg-success/10 text-success" },
};

/** Harness 六大组件名称 */
const HARNESS_COMPONENTS = [
  "任务边界",
  "上下文供给",
  "工具接入",
  "反馈回路",
  "安全护栏",
  "进化调度器",
];

/** 动作授权清单分组（AGENTS.md §4.7：L1 全自动 / L2 建议 / L3 人工确认 / L4 禁止） */
const ACTION_GROUPS: { level: AutomationLevel; title: string }[] = [
  { level: "L1", title: "L1 全自动" },
  { level: "L2", title: "L2 建议执行" },
  { level: "L3", title: "L3 需人工确认" },
  { level: "L4", title: "L4 绝对禁止" },
];

/** 日志状态颜色映射（未命中的状态在渲染处回退为 warning） */
const LOG_STATUS_META = {
  success: { label: "成功", className: "text-success bg-success/10" },
  error: { label: "失败", className: "text-danger bg-danger/10" },
  running: { label: "执行中", className: "text-brand-blue bg-brand-blue/10" },
  timeout: { label: "超时", className: "text-warning bg-warning/10" },
  needs_human: { label: "待人工", className: "text-warning bg-warning/10" },
};

/** 格式化 ISO 日期为中文可读 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 智能体详情面板
 * —— 右侧主区域，展示选中智能体的完整信息、统计、Tab 切换内容
 */
export function AgentDetailPanel() {
  const agents = useAgentStore((s) => s.agents);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const updateAgentStatus = useAgentStore((s) => s.updateAgentStatus);
  const deleteAgent = useAgentStore((s) => s.deleteAgent);
  const harnessProposals = useTradeStore((s) => s.harnessProposals);
  const skills = useSkillStore((s) => s.skills);
  const loadSkills = useSkillStore((s) => s.loadSkills);
  const connectors = useConnectorStore((s) => s.connectors);
  const loadConnectors = useConnectorStore((s) => s.loadConnectors);

  // 加载技能 / 连接器，用于绑定列表展示
  useEffect(() => {
    loadSkills();
    loadConnectors();
  }, [loadSkills, loadConnectors]);

  const agent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  // 真实运行日志（来自 /api/agents/[id]/logs，倒序最多 50 条）
  const {
    data: logsData,
    isLoading: logsLoading,
    isError: logsError,
  } = useQuery({
    queryKey: ["agent-logs", selectedAgentId],
    queryFn: () => apiClient.getAgentLogs(selectedAgentId as string),
    enabled: !!selectedAgentId,
  });
  const runLogs = ((logsData?.logs as AgentRunLog[] | undefined) ??
    []) as AgentRunLog[];

  // ---- 空状态 ----
  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          title="选择一个智能体"
          description="从左侧列表中选择智能体以查看详情、管理技能与连接器、审阅运行日志与 Harness 配置。"
        />
      </div>
    );
  }

  const initial = agent.name.charAt(0).toUpperCase();
  const isRunning = agent.status === "running";
  const sourceMeta = SOURCE_META[agent.source];

  // 绑定技能列表（从 store 根据 bindSkills id 过滤）
  const boundSkills = skills.filter((s) =>
    agent.bindSkills.includes(s.id),
  );

  // 绑定连接器列表（从 store 根据 bindConnectors id 过滤）
  const boundConnectors = connectors.filter((c) =>
    agent.bindConnectors.includes(c.id),
  );

  const pendingProposals = (harnessProposals || []).filter(
    (p) => p.status === "pending",
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ======== 顶部：头像 + 名称 + badges + 操作按钮 ======== */}
      <div className="border-border border-b p-6">
        <div className="flex items-start gap-4">
          {/* 渐变圆形头像（60px） */}
          <div
            className={cn(
              "flex size-[60px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xl font-bold text-white",
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
              {/* role badge */}
              <span className="bg-accent text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                {agent.role}
              </span>
              {/* source badge */}
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  sourceMeta.className,
                )}
              >
                {sourceMeta.label}
              </span>
              {/* permission badge */}
              <span className="bg-accent text-hint rounded-full px-2.5 py-0.5 text-xs">
                {agent.memoryPermission === "read-write"
                  ? "记忆读写"
                  : agent.memoryPermission === "read"
                    ? "记忆只读"
                    : "无记忆权限"}
              </span>
            </div>
          </div>

          {/* 右侧操作按钮组 */}
          <div className="flex shrink-0 items-center gap-2">
            {/* 启动/暂停按钮 */}
            {isRunning ? (
              <button
                type="button"
                onClick={() => updateAgentStatus(agent.id, "paused")}
                className="border-warning text-warning hover:bg-warning/10 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
              >
                <Pause className="size-3.5" />
                暂停
              </button>
            ) : (
              <button
                type="button"
                onClick={() => updateAgentStatus(agent.id, "running")}
                className="border-success text-success hover:bg-success/10 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
              >
                <Play className="size-3.5" />
                启动
              </button>
            )}
            {/* 编辑 */}
            <button
              type="button"
              className="border-border text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <Pencil className="size-3.5" />
              编辑
            </button>
            {/* 删除（高危：二次确认后以 confirm=true 重发，命中后端护栏） */}
            <button
              type="button"
              onClick={() => {
                if (confirm(`确认删除智能体「${agent.name}」？此操作不可撤销。`)) {
                  deleteAgent(agent.id, true).catch(() => {
                    // 删除失败（含确认门禁）已在 store 处理，此处忽略
                  });
                }
              }}
              className="border-danger/30 text-danger hover:bg-danger/10 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <Trash2 className="size-3.5" />
              删除
            </button>
          </div>
        </div>

        {/* ======== 运行统计栏（3个数字） ======== */}
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

      {/* ======== Tab 切换：概览 / 技能 / 连接器 / 日志 / Harness ======== */}
      <div className="flex-1 overflow-y-auto p-6 pt-4">
        <Tabs defaultValue="overview">
          <TabsList variant="line" className="mb-5">
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="skills">技能</TabsTrigger>
            <TabsTrigger value="connectors">连接器</TabsTrigger>
            <TabsTrigger value="logs">日志</TabsTrigger>
            <TabsTrigger value="harness">Harness</TabsTrigger>
          </TabsList>

          {/* ======== 概览 Tab ======== */}
          <TabsContent value="overview" className="space-y-5">
            {/* description */}
            <p className="text-muted-foreground text-sm leading-relaxed">
              {agent.description}
            </p>

            {/* can_do 列表 */}
            <div>
              <h3 className="text-foreground mb-2.5 text-sm font-semibold">
                能力范围
              </h3>
              <ul className="space-y-1.5">
                {agent.canDo.map((item, i) => (
                  <li
                    key={i}
                    className="text-muted-foreground flex items-start gap-2 text-sm"
                  >
                    <CheckCircle2 className="text-success mt-0.5 size-3.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* cannot_do 列表 */}
            <div>
              <h3 className="text-foreground mb-2.5 text-sm font-semibold">
                能力边界
              </h3>
              <ul className="space-y-1.5">
                {agent.cannotDo.map((item, i) => (
                  <li
                    key={i}
                    className="text-hint flex items-start gap-2 text-sm"
                  >
                    <XCircle className="text-danger mt-0.5 size-3.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>

          {/* ======== 技能 Tab ======== */}
          <TabsContent value="skills" className="space-y-3">
            {boundSkills.length > 0 ? (
              boundSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="border-border bg-card flex items-start gap-3 rounded-2xl border p-4"
                >
                  <div className="bg-accent text-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <Puzzle className="size-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-foreground truncate text-sm font-semibold">
                        {skill.name}
                      </h4>
                      <span className="text-hint shrink-0 rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-mono">
                        v{skill.version}
                      </span>
                      <StatusBadge
                        status={skill.status === "active" ? "connected" : "idle"}
                      />
                    </div>
                    <p className="text-hint mt-1 line-clamp-2 text-xs leading-relaxed">
                      {skill.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {skill.scenarios.slice(0, 3).map((s) => (
                        <span
                          key={s}
                          className="bg-accent text-muted-foreground rounded-md px-1.5 py-0.5 text-[10px]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-danger hover:bg-danger/10 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    解绑
                  </button>
                </div>
              ))
            ) : (
              <p className="text-hint py-8 text-center text-sm">暂未绑定技能</p>
            )}
            {/* 绑定技能按钮 */}
            <button
              type="button"
              className="border-brand text-brand hover:bg-brand/10 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors"
            >
              <Puzzle className="size-4" />
              绑定技能
            </button>
          </TabsContent>

          {/* ======== 连接器 Tab ======== */}
          <TabsContent value="connectors" className="space-y-3">
            {boundConnectors.length > 0 ? (
              boundConnectors.map((conn) => (
                <div
                  key={conn.id}
                  className="border-border bg-card flex items-center gap-3 rounded-2xl border p-4"
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center text-xl leading-none"
                    role="img"
                    aria-label={conn.name}
                  >
                    {conn.iconEmoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-foreground truncate text-sm font-semibold">
                        {conn.name}
                      </h4>
                      <StatusBadge
                        status={
                          conn.status === "connected"
                            ? "connected"
                            : conn.status === "error"
                              ? "error"
                              : "idle"
                        }
                      />
                    </div>
                    <p className="text-hint mt-0.5 text-xs">
                      {conn.permissions.length} 项权限
                      {conn.lastSync
                        ? ` · 上次同步 ${formatDate(conn.lastSync)}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-danger hover:bg-danger/10 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    断开
                  </button>
                </div>
              ))
            ) : (
              <p className="text-hint py-8 text-center text-sm">
                暂未绑定连接器
              </p>
            )}
            {/* 添加连接器按钮 */}
            <button
              type="button"
              className="border-brand text-brand hover:bg-brand/10 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors"
            >
              <Search className="size-4" />
              添加连接器
            </button>
          </TabsContent>

          {/* ======== 日志 Tab（真实运行日志，来自 /api/agents/[id]/logs） ======== */}
          <TabsContent value="logs" className="space-y-0">
            {logsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} variant="list-item" />
                ))}
              </div>
            ) : logsError ? (
              <div className="border-danger/30 bg-danger/5 flex items-center gap-2 rounded-xl border px-4 py-3">
                <AlertTriangle className="text-danger size-4 shrink-0" />
                <p className="text-danger text-sm">
                  运行日志加载失败，请稍后重试
                </p>
              </div>
            ) : runLogs.length > 0 ? (
              <div className="border-border overflow-hidden rounded-xl border">
                {runLogs.map((log, i) => {
                  const statusMeta =
                    LOG_STATUS_META[
                      log.status as keyof typeof LOG_STATUS_META
                    ] ?? {
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
                      <span className="text-hint shrink-0 w-[120px]">
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
                      {/* 耗时 */}
                      <span className="text-hint w-[72px] shrink-0 text-right">
                        {log.duration}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-hint py-8 text-center text-sm">
                暂无运行日志，该智能体执行任务后将在此留痕
              </p>
            )}
          </TabsContent>

          {/* ======== Harness Tab ======== */}
          <TabsContent value="harness" className="space-y-5">
            {/* 版本信息 */}
            <div className="border-border bg-card rounded-2xl border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-foreground text-sm font-semibold">
                    Harness 版本
                  </p>
                  <p className="text-hint mt-0.5 text-xs">
                    创建于 {formatDate(agent.createdAt)}
                  </p>
                </div>
                <span className="bg-brand/10 text-brand rounded-lg px-3 py-1.5 text-sm font-mono font-semibold">
                  v{agent.harnessVersion}
                </span>
              </div>
            </div>

            {/* 6 个组件状态卡片 */}
            <div>
              <h3 className="text-foreground mb-3 text-sm font-semibold">
                组件状态
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {HARNESS_COMPONENTS.map((comp) => (
                  <div
                    key={comp}
                    className="border-border bg-card rounded-2xl border p-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-2 shrink-0 rounded-full bg-success" />
                      <span className="text-foreground text-sm font-medium">
                        {comp}
                      </span>
                    </div>
                    <div className="text-hint mt-2 text-xs">
                      状态正常 · {formatDate(agent.lastActive)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 动作授权清单（AGENTS.md §4.7：按 L1-L4 分组的业务动作权限） */}
            <div>
              <h3 className="text-foreground mb-1 text-sm font-semibold">
                动作授权清单
              </h3>
              <p className="text-hint mb-3 text-xs">
                外贸场景预设动作的自动化授权等级（L1 全自动 → L4 绝对禁止自动）
              </p>
              <div className="space-y-4">
                {ACTION_GROUPS.map((group) => {
                  const actions = TRADE_ACTIONS.filter(
                    (a) => a.automationLevel === group.level,
                  );
                  if (actions.length === 0) return null;
                  return (
                    <div key={group.level}>
                      <div className="mb-2 flex items-center gap-2">
                        <AutomationBadge level={group.level} />
                        <span className="text-hint text-xs">
                          {actions.length} 项
                        </span>
                      </div>
                      <div className="space-y-2">
                        {actions.map((action) => (
                          <div
                            key={action.id}
                            className="border-border bg-card flex items-start justify-between gap-3 rounded-xl border p-3"
                          >
                            <div className="min-w-0">
                              <p className="text-foreground text-sm font-medium">
                                {action.name}
                              </p>
                              <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                                {action.description}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                                action.requiresApproval
                                  ? "bg-warning/10 text-warning"
                                  : "bg-success/10 text-success",
                              )}
                            >
                              {action.requiresApproval ? "需审批" : "免审批"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 待审批升级提案 */}
            {pendingProposals.length > 0 ? (
              <div>
                <h3 className="text-foreground mb-3 flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="text-warning size-4" />
                  待审批升级提案
                </h3>
                <div className="space-y-3">
                  {pendingProposals.map((proposal) => (
                    <div
                      key={proposal.id}
                      className="border-warning/30 bg-card space-y-3 rounded-2xl border p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-brand font-mono text-xs font-semibold">
                              {proposal.proposalId}
                            </span>
                            <RiskBadge level={proposal.proposedChange.riskLevel} />
                          </div>
                          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                            {proposal.problemStatement}
                          </p>
                          <p className="text-hint mt-1.5 text-xs">
                            目标组件：{proposal.proposedChange.targetComponent}
                          </p>
                        </div>
                      </div>
                      <div className="border-border flex items-center justify-between border-t pt-3">
                        <span className="text-hint text-xs">
                          触发方式：{proposal.triggeredBy === "auto" ? "自动" : "手动"}
                        </span>
                        <a
                          href="/settings"
                          className="bg-brand hover:bg-brand/90 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors"
                        >
                          审批
                          <ChevronRight className="size-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
