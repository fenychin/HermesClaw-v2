"use client";

import { useState, useEffect } from "react";
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
  Plug,
  Shield,
  Zap,
  XCircle,
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
import {
  AutomationLevelBadge,
  AUTOMATION_LEVEL_META,
} from "@/components/common/agent-status-badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useUiStore } from "@/stores/ui-store";
import { useSkillStore } from "@/stores/skill-store";
import { updateSkillBindings } from "@/lib/api/workspace";
import type { Skill } from "@/types";

/** 运行时校验 Agent 关键字段 */
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

// ============================================================
// L1-L4 展示扩展（基于共享 AUTOMATION_LEVEL_META）
// ============================================================
const LEVEL_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  L1: Zap, L2: CheckCircle2, L3: AlertTriangle, L4: Shield,
};
const LEVEL_COLOR_MAP: Record<string, { color: string; bgClass: string; textClass: string; borderClass: string }> = {
  L1: { color: "success", bgClass: "bg-success/10", textClass: "text-success", borderClass: "border-success/20" },
  L2: { color: "brand-blue", bgClass: "bg-brand-blue/10", textClass: "text-brand-blue", borderClass: "border-brand-blue/20" },
  L3: { color: "warning", bgClass: "bg-warning/10", textClass: "text-warning", borderClass: "border-warning/20" },
  L4: { color: "danger", bgClass: "bg-danger/10", textClass: "text-danger", borderClass: "border-danger/20" },
};
const LEVEL_EXAMPLES: Record<string, string> = {
  L1: "询盘分拣、资料整理、日程提醒等无副作用的读操作与分类任务",
  L2: "邮件撰写、客户分析、市场研究等标准输出类任务",
  L3: "报价发送、合同生成、风险审查结论等涉及资金或信用的决策任务",
  L4: "资金划拨、合约签署、删除客户数据等不可逆操作",
};

function getLevelDetail(level: string) {
  const meta = AUTOMATION_LEVEL_META[level] ?? AUTOMATION_LEVEL_META["L2"];
  const colors = LEVEL_COLOR_MAP[level] ?? LEVEL_COLOR_MAP["L2"];
  const Icon = LEVEL_ICON[level] ?? CheckCircle2;
  return { ...meta, ...colors, icon: Icon, examples: LEVEL_EXAMPLES[level] ?? "" };
}

// ============================================================
// SSE 状态标签（仅在 agent 加载成功后渲染，避免阻塞）
// ============================================================
function SseStatusLabel({ agentId }: { agentId: string }) {
  const sseState = useUiStore((s) => s.agentExecutionStates[agentId]);
  const sseStatus = sseState?.status;
  if (!sseStatus || sseStatus === "idle") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        sseStatus === "executing" && "bg-warning/10 text-warning",
        sseStatus === "succeeded" && "bg-success/10 text-success",
        sseStatus === "failed" && "bg-danger/10 text-danger",
        sseStatus === "cancelled" && "bg-muted/50 text-muted-foreground",
      )}
    >
      {sseStatus === "executing" ? "SSE·执行中" : sseStatus === "failed" ? "SSE·失败" : sseStatus === "succeeded" ? "SSE·完成" : "SSE·已取消"}
    </span>
  );
}

// ============================================================
// 技能绑定区域（增强版：显示版本/来源 + 绑定选择器）
// ============================================================
const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  BUILTIN: { label: "内置", className: "bg-blue-500/10 text-blue-400" },
  CUSTOM: { label: "自定义", className: "bg-green-500/10 text-green-400" },
  EXTERNAL: { label: "外部", className: "bg-purple-500/10 text-purple-400" },
};

function SkillBindingSection({ agent }: { agent: Agent }) {
  const allSkills = useSkillStore((s) => s.skills);
  const loadSkills = useSkillStore((s) => s.loadSkills);
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadSkills(); }, [loadSkills]);

  // 已绑定 skill IDs
  const boundIds = new Set(agent.bindSkills ?? []);

  // 可绑定（未绑定的活跃技能）
  const availableSkills = allSkills.filter(
    (s) => s.status === "active" && !boundIds.has(s.id),
  );

  // 已绑定技能的完整信息
  const boundSkills = allSkills.filter((s) => boundIds.has(s.id));

  const handleAddBinding = async (skillId: string) => {
    setSubmitting(true);
    try {
      const patches = [...Array.from(boundIds), skillId].map((id) => ({
        skillId: id,
        enabled: true,
      }));
      const result = await updateSkillBindings(agent.id, patches);
      toast.info(`技能绑定变更已提交审批，提案 ID: ${result.proposalId}`);
    } catch {
      toast.error("绑定技能失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveBinding = async (skillId: string) => {
    setSubmitting(true);
    try {
      const patches = Array.from(boundIds)
        .filter((id) => id !== skillId)
        .map((id) => ({ skillId: id, enabled: false }));
      const result = await updateSkillBindings(agent.id, patches);
      toast.info(`技能解绑变更已提交审批，提案 ID: ${result.proposalId}`);
    } catch {
      toast.error("解绑技能失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 已绑定列表 */}
      <div className="flex items-center justify-between">
        <h3 className="text-foreground text-sm font-semibold">
          已绑定技能 ({boundSkills.length})
        </h3>
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          disabled={submitting}
          className="text-brand hover:underline text-xs font-medium"
        >
          {showPicker ? "收起" : "+ 绑定技能"}
        </button>
      </div>

      {/* 技能选择器 */}
      {showPicker && (
        <div className="bg-accent/20 border border-border rounded-xl p-3 space-y-2 max-h-48 overflow-y-auto">
          {availableSkills.length === 0 ? (
            <p className="text-hint text-xs italic">所有活跃技能均已绑定</p>
          ) : (
            availableSkills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center justify-between gap-3 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm truncate">{skill.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-hint text-[10px] font-mono">v{skill.version}</span>
                    <span
                      className={cn(
                        "rounded text-[10px] px-1.5 py-px",
                        SOURCE_BADGE[skill.source]?.className ?? "bg-accent text-muted-foreground",
                      )}
                    >
                      {SOURCE_BADGE[skill.source]?.label ?? skill.source}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddBinding(skill.id)}
                  disabled={submitting}
                  className="shrink-0 text-brand hover:underline text-xs font-medium"
                >
                  绑定
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* 已绑定技能卡片 */}
      {boundSkills.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {boundSkills.map((skill) => (
            <div
              key={skill.id}
              className="bg-card border border-border rounded-xl p-4 hover:border-brand/30 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <Puzzle className="size-4 text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm font-medium truncate">
                    {skill.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-hint text-[10px] font-mono">
                      v{skill.version}
                    </span>
                    <span
                      className={cn(
                        "rounded text-[10px] px-1.5 py-px",
                        SOURCE_BADGE[skill.source]?.className ?? "bg-accent text-muted-foreground",
                      )}
                    >
                      {SOURCE_BADGE[skill.source]?.label ?? skill.source}
                    </span>
                    <StatusBadge
                      status={skill.status === "active" ? "running" : "idle"}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveBinding(skill.id)}
                  disabled={submitting}
                  className="shrink-0 text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100 transition-all text-xs font-medium"
                >
                  解绑
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Puzzle}
          title="技能绑定管理"
          description="点击「+ 绑定技能」为该智能体关联技能，支持版本选择与启用/禁用控制。"
        />
      )}
    </div>
  );
}

// ============================================================
// 详情页面主体
// ============================================================
export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();

  // 获取智能体数据
  const {
    data: agentData,
    isLoading: agentLoading,
    isError: agentError,
  } = useQuery({
    queryKey: ["agent", id],
    queryFn: async () => {
      const data = await apiClient.getAgent(id);
      const raw = data?.agent;
      if (isValidAgent(raw)) return raw;
      throw new Error("智能体数据校验失败");
    },
    enabled: !!id,
    retry: 1,
    staleTime: 30_000,
  });
  const agent = agentData ?? null;

  // 获取运行日志
  const {
    data: logsData,
    isLoading: logsLoading,
    isError: logsError,
  } = useQuery({
    queryKey: ["agent-logs", id],
    queryFn: async () => {
      try {
        const data = await apiClient.getAgentLogs(id);
        const raw = data?.logs;
        if (!Array.isArray(raw)) return [];
        return raw.filter(isValidLog);
      } catch {
        return [];
      }
    },
    enabled: !!id,
    retry: 1,
    staleTime: 30_000,
  });
  const runLogs = logsData ?? [];

  // 从 Zustand 读取 SSE 状态（由页面级 useOpenClawStream 更新）
  const sseState = useUiStore((s) => s.agentExecutionStates[id]);

  // ---- 加载中 ----
  if (agentLoading) {
    return (
      <PageTransition>
        <div className="p-6 space-y-6">
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
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} variant="list-item" />
            ))}
          </div>
        </div>
      </PageTransition>
    );
  }

  // ---- 错误（连 mock 都没有） ----
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
  const level = agent.automationLevel ?? "L2";
  const levelMeta = getLevelDetail(level);
  const isMock = agent.id.startsWith("agent-00") && !agent.bindSkills?.length;

  const handleToggleStatus = () => {
    const nextStatus = agent.status === "running" ? "paused" : "running";
    toast.info(`智能体状态变更（${nextStatus === "running" ? "启动" : "暂停"}）功能即将上线`);
  };

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        {/* mock 数据提示 */}
        {isMock && (
          <div className="border-brand-blue/20 bg-brand-blue/5 flex items-center gap-2 rounded-xl border px-4 py-2.5">
            <Zap className="text-brand-blue size-4 shrink-0" />
            <p className="text-brand-blue text-xs">
              当前展示为内置智能体预览数据。完整配置（技能绑定、连接器、运行日志）将在数据库同步后展示。
            </p>
          </div>
        )}

        {/* ======== 顶部：头像 + 名称 + 状态 + 操作 ======== */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "flex size-15 shrink-0 items-center justify-center rounded-full bg-linear-to-br text-xl font-bold text-white",
                getGradient(agent.id),
              )}
            >
              {initial}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-foreground truncate text-xl font-bold">{agent.name}</h1>
                <StatusBadge status={agent.status} />
                {/* SSE 实时状态 */}
                <SseStatusLabel agentId={id} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="bg-accent text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                  {agent.role}
                </span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", sourceMeta.className)}>
                  {sourceMeta.label}
                </span>
                <AutomationLevelBadge level={level} showDesc />
                <span className="bg-accent text-hint rounded-full px-2.5 py-0.5 text-xs font-mono">
                  Harness v{agent.harnessVersion}
                </span>
              </div>
              <p className="text-muted-foreground text-sm mt-2 leading-relaxed line-clamp-2">
                {agent.description}
              </p>
              {sseState?.currentTask && (
                <p className="text-warning text-xs mt-1.5">{sseState.currentTask}</p>
              )}
            </div>

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
                  <><Pause className="size-3.5" />暂停</>
                ) : (
                  <><Play className="size-3.5" />启动</>
                )}
              </button>
            </div>
          </div>

          {/* 运行统计栏 */}
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
            <div className="ml-auto">
              <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2", levelMeta.borderClass, levelMeta.bgClass)}>
                <levelMeta.icon className={cn("size-4", levelMeta.textClass)} />
                <div>
                  <p className={cn("text-xs font-semibold", levelMeta.textClass)}>{level} · {levelMeta.label}</p>
                  <p className="text-hint text-[10px]">{levelMeta.desc}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ======== Tab 切换 ======== */}
        <Tabs defaultValue="overview">
          <TabsList variant="line" className="mb-5">
            <TabsTrigger value="overview"><Bot className="size-4" />概览</TabsTrigger>
            <TabsTrigger value="skills"><Puzzle className="size-4" />技能绑定</TabsTrigger>
            <TabsTrigger value="connectors"><Plug className="size-4" />连接器</TabsTrigger>
            <TabsTrigger value="memory"><Brain className="size-4" />记忆权限</TabsTrigger>
            <TabsTrigger value="logs"><ScrollText className="size-4" />运行日志</TabsTrigger>
            <TabsTrigger value="harness"><GitBranch className="size-4" />Harness 版本</TabsTrigger>
          </TabsList>

          {/* 概览 */}
          <TabsContent value="overview" className="space-y-6">
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-foreground text-sm font-semibold mb-3">能力范围（canDo）</h3>
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
              <h3 className="text-foreground text-sm font-semibold mb-3">能力边界（cannotDo）</h3>
              <ul className="space-y-2">
                {agent.cannotDo.map((item, i) => (
                  <li key={i} className="text-hint flex items-start gap-2 text-sm">
                    <XCircle className="text-danger mt-0.5 size-3.5 shrink-0" />
                    {item}
                  </li>
                ))}
                {agent.cannotDo.length === 0 && <p className="text-hint text-xs italic">暂无明确边界限制</p>}
              </ul>
            </div>
            <div className={cn("bg-card border rounded-2xl p-5", levelMeta.borderClass)}>
              <div className="flex items-center gap-2 mb-3">
                <levelMeta.icon className={cn("size-4", levelMeta.textClass)} />
                <h3 className="text-foreground text-sm font-semibold">自动化授权等级：{level} · {levelMeta.label}</h3>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">{levelMeta.desc}</p>
              <p className="text-hint text-xs mt-2">适用场景：{levelMeta.examples}</p>
            </div>
          </TabsContent>

          {/* 技能绑定（增强版：显示版本/来源 + 绑定选择器） */}
          <TabsContent value="skills">
            <SkillBindingSection agent={agent} />
          </TabsContent>

          {/* 连接器 */}
          <TabsContent value="connectors">
            {agent.bindConnectors && agent.bindConnectors.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {agent.bindConnectors.map((connector, i) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-4 hover:border-brand-blue/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-brand-blue/10 flex items-center justify-center shrink-0">
                        <Plug className="size-4 text-brand-blue" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground text-sm font-medium truncate">{connector}</p>
                        <p className="text-hint text-xs mt-0.5">连接器授权状态通过 ToolRegistry 管理</p>
                      </div>
                      <span className="bg-accent text-hint rounded px-1.5 py-0.5 text-[10px] shrink-0">已绑定</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Plug} title="连接器绑定" description="智能体可绑定 Gmail、CRM、Slack 等外部连接器（AGENTS.md §4.3）。该功能将在后续版本中上线。" />
            )}
          </TabsContent>

          {/* 记忆权限 */}
          <TabsContent value="memory">
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="text-foreground text-sm font-semibold mb-3">当前记忆权限</h3>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "size-10 rounded-xl flex items-center justify-center shrink-0",
                    agent.memoryPermission === "read-write" && "bg-success/10",
                    agent.memoryPermission === "read" && "bg-brand-blue/10",
                    agent.memoryPermission === "none" && "bg-muted/50",
                  )}>
                    <Brain className={cn(
                      "size-5",
                      agent.memoryPermission === "read-write" && "text-success",
                      agent.memoryPermission === "read" && "text-brand-blue",
                      agent.memoryPermission === "none" && "text-muted-foreground",
                    )} />
                  </div>
                  <div>
                    <p className="text-foreground text-sm font-medium">
                      {agent.memoryPermission === "read-write" ? "读写权限" : agent.memoryPermission === "read" ? "只读权限" : "无权限"}
                    </p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      {agent.memoryPermission === "read-write"
                        ? "智能体可读取相关记忆并写入新的经验与上下文"
                        : agent.memoryPermission === "read"
                          ? "智能体仅可读取相关记忆，不可写入新数据"
                          : "智能体不可访问记忆系统"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="text-foreground text-sm font-semibold mb-3">记忆分级说明</h3>
                <div className="space-y-3">
                  {[
                    { label: "短期记忆", desc: "当前会话上下文，任务结束后可选择性沉淀", icon: Clock },
                    { label: "中期记忆", desc: "项目空间内共享的项目级知识与经验", icon: Brain },
                    { label: "长期记忆", desc: "跨项目的企业级知识资产与最佳实践", icon: ScrollText },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3">
                      <item.icon className="size-4 text-hint mt-0.5 shrink-0" />
                      <div>
                        <p className="text-foreground text-sm font-medium">{item.label}</p>
                        <p className="text-hint text-xs">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* 运行日志 */}
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
                  const statusMeta = LOG_STATUS_META[log.status] ?? { label: log.status, className: "text-warning bg-warning/10" };
                  return (
                    <div key={log.id} className={cn("border-border flex items-center gap-3 px-4 py-2.5 font-mono text-xs", i < runLogs.length - 1 && "border-b")}>
                      <span className="text-hint shrink-0 w-30">{formatDate(log.createdAt)}</span>
                      <span className="text-muted-foreground min-w-0 flex-1 truncate">{log.detail || log.taskName}</span>
                      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", statusMeta.className)}>{statusMeta.label}</span>
                      {log.riskLevel && (
                        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                          log.riskLevel === "high" ? "text-danger bg-danger/10" : log.riskLevel === "medium" ? "text-warning bg-warning/10" : "text-success bg-success/10")}>
                          {log.riskLevel === "high" ? "高风险" : log.riskLevel === "medium" ? "中风险" : "低风险"}
                        </span>
                      )}
                      <span className="text-hint w-18 shrink-0 text-right">{log.duration}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={ScrollText} title="暂无运行日志" description="该智能体执行任务后，运行日志将在此留痕。" />
            )}
          </TabsContent>

          {/* Harness 版本 */}
          <TabsContent value="harness" className="space-y-5">
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-foreground text-sm font-semibold">当前 Harness 版本</h3>
                  <p className="text-hint text-xs mt-1">创建于 {formatDate(agent.createdAt)} · 最近活跃 {formatDate(agent.lastActive)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <AutomationLevelBadge level={level} />
                  <span className="bg-brand/10 text-brand rounded-lg px-3 py-1.5 text-sm font-mono font-semibold">v{agent.harnessVersion}</span>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-foreground text-sm font-semibold mb-4">自动化授权等级（AGENTS.md §4.7）</h3>
              <div className="space-y-3">
                {(["L1", "L2", "L3", "L4"] as const).map((l) => {
                  const m = getLevelDetail(l);
                  const isCurrent = level === l;
                  return (
                    <div key={l} className={cn("flex items-start gap-3 rounded-xl border p-3 transition-colors", m.borderClass, isCurrent ? cn(m.bgClass, "border-2") : "border-border bg-card")}>
                      <div className={cn("size-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5", m.bgClass)}>
                        <m.icon className={cn("size-3.5", m.textClass)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs font-mono font-bold", m.textClass)}>{l}</span>
                          <span className="text-foreground text-xs font-medium">{m.label}</span>
                          {isCurrent && <span className={cn("text-[10px] rounded px-1.5 py-0.5 font-medium", m.bgClass, m.textClass)}>当前等级</span>}
                        </div>
                        <p className="text-muted-foreground text-xs mt-1">{m.desc}</p>
                        <p className="text-hint text-[11px] mt-0.5">示例：{m.examples}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-foreground text-sm font-semibold mb-3">Harness 六大组件</h3>
              <div className="space-y-2">
                {[
                  { name: "任务边界", desc: "canDo / cannotDo 声明", ver: "v1.0.0" },
                  { name: "上下文供给链", desc: "知识版本化与 KCL 记录", ver: "v1.0.0" },
                  { name: "受控工具接入", desc: "ToolRegistry + 短期 Token", ver: "v1.0.0" },
                  { name: "闭环反馈", desc: "AgentLog + AuditLog 留痕", ver: "v1.0.0" },
                  { name: "安全护栏", desc: "置信度/高危门禁/L1-L4 授权", ver: "v1.0.0" },
                  { name: "进化调度器", desc: "72h 自动评估 + HEP 提案", ver: "v1.0.0" },
                ].map((comp) => (
                  <div key={comp.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div><span className="text-foreground text-sm">{comp.name}</span><span className="text-hint text-xs ml-2">{comp.desc}</span></div>
                    <span className="text-hint text-xs font-mono">{comp.ver}</span>
                  </div>
                ))}
              </div>
            </div>
            <EmptyState icon={Clock} title="升级建议" description="基于运行日志与失败率指标，Harness 自演化引擎将自动生成升级提案。" />
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  );
}
