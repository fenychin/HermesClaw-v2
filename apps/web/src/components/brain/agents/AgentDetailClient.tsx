"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot,
  Puzzle,
  Brain,
  ScrollText,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plug,
  Shield,
  Zap,
  XCircle,
  ChevronLeft,
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  RotateCcw,
  Info,
  History,
  ChevronDown,
  ChevronUp,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import {
  AutomationLevelBadge,
  AUTOMATION_LEVEL_META_V2,
} from "./AutomationLevelBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ConfirmationRequiredError } from "@/lib/api-client";
import type { Agent } from "@/types";

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = d.getHours().toString().padStart(2, "0");
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${mm}月${dd}日 ${hh}:${min}`;
}

/* ------------------------------------------------------------------ */
/* 骨架屏                                                              */
/* ------------------------------------------------------------------ */

function TabSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="bg-card border-border rounded-xl border p-4 animate-pulse"
        >
          <div className="h-4 w-3/4 rounded bg-accent" />
          <div className="mt-2 h-3 w-1/2 rounded bg-accent" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 日志状态映射                                                        */
/* ------------------------------------------------------------------ */

const LOG_STATUS_META: Record<string, { label: string; className: string }> = {
  completed: { label: "完成", className: "bg-success/10 text-success" },
  failed: { label: "失败", className: "bg-danger/10 text-danger" },
  running: { label: "运行中", className: "bg-blue-500/10 text-blue-500" },
  cancelled: { label: "已取消", className: "bg-muted/50 text-muted-foreground" },
  pending: { label: "等待中", className: "bg-warning/10 text-warning" },
};

/* ------------------------------------------------------------------ */
/* Snapshots 类型                                                       */
/* ------------------------------------------------------------------ */

interface SnapshotItem {
  snapshotId: string;
  status: string;
  snapshotType: string;
  policySnapshotVersion: string;
  createdAt: string;
  createdBy: string;
  restoredAt: string | null;
  restoredBy: string | null;
  summary: {
    skillCount: number;
    connectorCount: number;
    canDoCount: number;
    cannotDoCount: number;
    automationLevel: string;
  };
}

const SNAPSHOT_STATUS_META: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  active: {
    label: "当前生效",
    className: "bg-success/10 text-success border-success/30",
    icon: CheckCircle2,
  },
  superseded: {
    label: "已取代",
    className: "bg-muted/50 text-muted-foreground border-border",
    icon: Clock,
  },
  "rolled-back-to": {
    label: "已回滚至此",
    className: "bg-warning/10 text-warning border-warning/30",
    icon: RotateCcw,
  },
};

const SNAPSHOT_TYPE_LABELS: Record<string, string> = {
  "pre-canary": "Canary 前快照",
  "pre-active": "激活前快照",
  manual: "手动快照",
  scheduled: "定时快照",
};

/* ================================================================== */
/* 主组件                                                               */
/* ================================================================== */

interface AgentDetailClientProps {
  initialAgent: Agent;
}

export function AgentDetailClient({ initialAgent }: AgentDetailClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  /* ---- Agent 数据 (用 initialAgent 做 placeholderData) ---- */
  const { data: agent } = useQuery({
    queryKey: ["agent", initialAgent.id],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${initialAgent.id}`);
      if (!res.ok) throw new Error("加载失败");
      const json = await res.json();
      return (json.data?.agent ?? json.agent ?? initialAgent) as Agent;
    },
    placeholderData: initialAgent,
    staleTime: 30_000,
  });

  const currentAgent = agent ?? initialAgent;

  /* ---- 全部技能 (用于选择器) ---- */
  const { data: allSkills } = useQuery({
    queryKey: ["all-skills"],
    queryFn: async () => {
      const res = await fetch("/api/skills");
      if (!res.ok) throw new Error("加载技能库失败");
      const json = await res.json();
      return (json.data?.skills ?? []) as Array<{
        id: string; name: string; description: string;
        version: string; source: string; status: string;
      }>;
    },
    staleTime: 60_000,
  });

  /* ---- 全部连接器 ---- */
  const { data: allConnectors } = useQuery({
    queryKey: ["brain-connectors"],
    queryFn: async () => {
      const res = await fetch("/api/brain/connectors");
      if (!res.ok) throw new Error("加载连接器失败");
      const json = await res.json();
      return (json.data?.connectors ?? []) as Array<{
        id: string; name: string; description: string; iconEmoji: string;
        category: string; status: string;
      }>;
    },
    staleTime: 60_000,
  });

  /* ---- 运行日志 ---- */
  const { data: logs, isLoading: logsLoading, isError: logsError } = useQuery({
    queryKey: ["agent-logs", currentAgent.id],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${currentAgent.id}/logs`);
      if (!res.ok) throw new Error("加载日志失败");
      const json = await res.json();
      return (json.data?.logs ?? []) as Array<{
        id: string; taskName: string; status: string; duration: string;
        detail?: string; riskLevel?: string; workflowRunId?: string;
        createdAt: string;
      }>;
    },
  });

  /* ---- 记忆权限本地状态 ---- */
  const memoryPerm = currentAgent.memoryPermission ?? "read";
  const [memToggles, setMemToggles] = useState({
    short: memoryPerm !== "none",
    mid: memoryPerm === "read-write",
    long: memoryPerm === "read-write",
    frozen: false,
  });

  useEffect(() => {
    setMemToggles({
      short: memoryPerm !== "none",
      mid: memoryPerm === "read-write",
      long: memoryPerm === "read-write",
      frozen: false,
    });
  }, [memoryPerm]);

  /* ---- 技能绑定操作 ---- */
  const boundSkillIds = new Set(currentAgent.bindSkills ?? []);
  const boundSkills = (allSkills ?? []).filter((s) => boundSkillIds.has(s.id));
  const availableSkills = (allSkills ?? []).filter(
    (s) => s.status === "active" && !boundSkillIds.has(s.id),
  );

  const [skillSubmitting, setSkillSubmitting] = useState(false);

  const handleBindSkill = useCallback(
    async (skillId: string) => {
      setSkillSubmitting(true);
      try {
        const patches = [...boundSkillIds, skillId].map((id) => ({
          skillId: id,
          enabled: true,
        }));
        const res = await fetch(`/api/agents/${currentAgent.id}/skill-bindings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skillBindings: patches }),
        });
        if (!res.ok) throw new Error("绑定失败");
        const json = await res.json();
        if (json.success === false) throw new Error(json.error ?? "绑定失败");
        toast.info(
          json.data?.proposalId
            ? `技能绑定提案已提交，ID: ${json.data.proposalId}`
            : "技能绑定变更已提交",
        );
        queryClient.invalidateQueries({ queryKey: ["agent", currentAgent.id] });
        queryClient.invalidateQueries({ queryKey: ["all-skills"] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "绑定技能失败");
      } finally {
        setSkillSubmitting(false);
      }
    },
    [boundSkillIds, currentAgent.id, queryClient],
  );

  const handleUnbindSkill = useCallback(
    async (skillId: string) => {
      setSkillSubmitting(true);
      try {
        const patches = Array.from(boundSkillIds)
          .filter((id) => id !== skillId)
          .map((id) => ({ skillId: id, enabled: true }));
        const res = await fetch(`/api/agents/${currentAgent.id}/skill-bindings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skillBindings: patches }),
        });
        if (!res.ok) throw new Error("解绑失败");
        const json = await res.json();
        if (json.success === false) throw new Error(json.error ?? "解绑失败");
        toast.info(
          json.data?.proposalId
            ? `技能解绑提案已提交，ID: ${json.data.proposalId}`
            : "技能解绑变更已提交",
        );
        queryClient.invalidateQueries({ queryKey: ["agent", currentAgent.id] });
        queryClient.invalidateQueries({ queryKey: ["all-skills"] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "解绑技能失败");
      } finally {
        setSkillSubmitting(false);
      }
    },
    [boundSkillIds, currentAgent.id, queryClient],
  );

  /* ---- 连接器操作 ---- */
  const [connectorSubmitting, setConnectorSubmitting] = useState(false);
  const currentConnectors = currentAgent.bindConnectors ?? [];

  const handleRemoveConnector = useCallback(
    async (connectorId: string) => {
      setConnectorSubmitting(true);
      try {
        const next = currentConnectors.filter((c) => c !== connectorId);
        const res = await fetch(`/api/agents/${currentAgent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bindConnectors: next }),
        });
        if (!res.ok) throw new Error("移除连接器失败");
        toast.success("连接器已移除");
        queryClient.invalidateQueries({ queryKey: ["agent", currentAgent.id] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失败");
      } finally {
        setConnectorSubmitting(false);
      }
    },
    [currentConnectors, currentAgent.id, queryClient],
  );

  const handleAddConnector = useCallback(
    async (connectorId: string) => {
      if (currentConnectors.includes(connectorId)) return;
      setConnectorSubmitting(true);
      try {
        const next = [...currentConnectors, connectorId];
        const res = await fetch(`/api/agents/${currentAgent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bindConnectors: next }),
        });
        if (!res.ok) throw new Error("添加连接器失败");
        toast.success("连接器已绑定");
        queryClient.invalidateQueries({ queryKey: ["agent", currentAgent.id] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失败");
      } finally {
        setConnectorSubmitting(false);
      }
    },
    [currentConnectors, currentAgent.id, queryClient],
  );

  /* ---- Harness 快照数据 ---- */
  const { data: snapshots, isLoading: snapshotsLoading } = useQuery({
    queryKey: ["harness-snapshots", currentAgent.id],
    queryFn: async (): Promise<SnapshotItem[]> => {
      const res = await fetch(`/api/agents/${currentAgent.id}/harness`);
      if (!res.ok) throw new Error("加载快照失败");
      const json = await res.json();
      return (json.data?.snapshots ?? []) as SnapshotItem[];
    },
    staleTime: 60_000,
  });

  /* ---- 回滚操作 ---- */
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<SnapshotItem | null>(null);

  const handleRollbackInitiate = useCallback((snapshot: SnapshotItem) => {
    setConfirmTarget(snapshot);
  }, []);

  const handleRollbackConfirm = useCallback(async () => {
    if (!confirmTarget) return;
    setRollbackSubmitting(true);
    try {
      const res = await fetch("/api/rollbacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: currentAgent.id,
          snapshotId: confirmTarget.snapshotId,
          reason: `从智能体详情页回滚至快照 ${confirmTarget.snapshotId}（${confirmTarget.snapshotType}）`,
          confirm: true,
        }),
      });
      const json = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "回滚失败");
      }
      toast.success(
        json.data?.message ?? `已回滚至快照 ${confirmTarget.snapshotId.slice(0, 8)}…`,
      );
      setConfirmTarget(null);
      queryClient.invalidateQueries({ queryKey: ["agent", currentAgent.id] });
      queryClient.invalidateQueries({
        queryKey: ["harness-snapshots", currentAgent.id],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "回滚操作失败");
    } finally {
      setRollbackSubmitting(false);
    }
  }, [confirmTarget, currentAgent.id, queryClient]);

  const handleRollbackCancel = useCallback(() => {
    setConfirmTarget(null);
  }, []);

  /* ---- 导出 ---- */
  const level = currentAgent.automationLevel ?? "L2";
  const levelMeta = AUTOMATION_LEVEL_META_V2[level] ?? AUTOMATION_LEVEL_META_V2["L2"];
  const initial = currentAgent.name.charAt(0).toUpperCase();

  return (
    <PageTransition>
      <div className="w-full max-w-5xl mx-auto py-6 px-6 space-y-6">
        {/* 面包屑 */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/brain/memory" className="hover:text-foreground transition-colors">
            智慧大脑
          </Link>
          <span>/</span>
          <Link href="/brain/agents" className="hover:text-foreground transition-colors">
            智能体
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-[200px]">
            {currentAgent.name}
          </span>
        </div>

        {/* ---- 顶部信息卡 ---- */}
        <div className="bg-card border-border rounded-2xl border p-5">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "flex size-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold",
                "bg-accent text-accent-foreground",
              )}
            >
              {initial}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-foreground truncate text-xl font-bold">
                  {currentAgent.name}
                </h1>
                <StatusBadge status={currentAgent.status} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="bg-accent text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                  {currentAgent.role}
                </span>
                <AutomationLevelBadge level={level} showTooltip />
              </div>
              <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                {currentAgent.description || "暂无描述"}
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/brain/agents")}
              className="shrink-0"
            >
              <ChevronLeft className="size-4 mr-1" />
              返回列表
            </Button>
          </div>

          {/* 统计栏 */}
          <div className="border-border mt-5 flex items-center gap-8 border-t pt-4">
            <div>
              <p className="text-hint text-xs">今日任务</p>
              <p className="text-foreground mt-0.5 text-xl font-semibold tabular-nums">
                {currentAgent.stats.todayTasks}
              </p>
            </div>
            <div>
              <p className="text-hint text-xs">成功率</p>
              <p className="text-success mt-0.5 text-xl font-semibold tabular-nums">
                {(currentAgent.stats.successRate * 100).toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-hint text-xs">平均耗时</p>
              <p className="text-foreground mt-0.5 text-xl font-semibold tabular-nums">
                {currentAgent.stats.avgDuration}
              </p>
            </div>
            <div className="ml-auto">
              <AutomationLevelBadge level={level} showDesc />
            </div>
          </div>
        </div>

        {/* =========================== Tab 区域 =========================== */}
        <Tabs defaultValue="overview">
          <TabsList variant="line" className="mb-5">
            <TabsTrigger value="overview">
              <Info className="size-4 mr-1.5" />概览
            </TabsTrigger>
            <TabsTrigger value="skills">
              <Puzzle className="size-4 mr-1.5" />技能绑定
            </TabsTrigger>
            <TabsTrigger value="connectors">
              <Plug className="size-4 mr-1.5" />连接器
            </TabsTrigger>
            <TabsTrigger value="memory">
              <Brain className="size-4 mr-1.5" />记忆权限
            </TabsTrigger>
            <TabsTrigger value="logs">
              <ScrollText className="size-4 mr-1.5" />运行日志
            </TabsTrigger>
            <TabsTrigger value="harness">
              <GitBranch className="size-4 mr-1.5" />Harness 版本
            </TabsTrigger>
          </TabsList>

          {/* ======================== 概览 ======================== */}
          <TabsContent value="overview" className="space-y-6">
            <div className="bg-card border-border rounded-2xl border p-5">
              <h3 className="text-foreground text-sm font-semibold mb-3">
                能力范围（canDo）
              </h3>
              {currentAgent.canDo.length > 0 ? (
                <ul className="space-y-2">
                  {currentAgent.canDo.map((item, i) => (
                    <li
                      key={i}
                      className="text-muted-foreground flex items-start gap-2 text-sm"
                    >
                      <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-hint text-xs italic">暂无定义</p>
              )}
            </div>

            <div className="bg-card border-border rounded-2xl border p-5">
              <h3 className="text-foreground text-sm font-semibold mb-3">
                能力边界（cannotDo）
              </h3>
              {currentAgent.cannotDo.length > 0 ? (
                <ul className="space-y-2">
                  {currentAgent.cannotDo.map((item, i) => (
                    <li
                      key={i}
                      className="text-hint flex items-start gap-2 text-sm"
                    >
                      <XCircle className="text-danger mt-0.5 size-4 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-hint text-xs italic">暂无明确边界限制</p>
              )}
            </div>

            <div className={cn("bg-card border rounded-2xl p-5", levelMeta.className)}>
              <h3 className="text-foreground text-sm font-semibold mb-3">
                自动化授权等级
              </h3>
              <div className="space-y-3">
                {(["L1", "L2", "L3", "L4"] as const).map((l) => {
                  const m = AUTOMATION_LEVEL_META_V2[l];
                  const isCurrent = level === l;
                  return (
                    <div
                      key={l}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-3 transition-colors",
                        isCurrent
                          ? cn(m.className, "border-2")
                          : "border-border bg-card",
                      )}
                    >
                      <span
                        className={cn(
                          "rounded-lg px-2 py-1 text-xs font-mono font-bold shrink-0 border",
                          m.className,
                        )}
                      >
                        {l}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground text-sm font-medium">
                            {m.label}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] rounded px-1.5 py-0.5 font-medium bg-brand/10 text-brand">
                              当前等级
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground text-xs mt-1">{m.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* ======================== 技能绑定 ======================== */}
          <TabsContent value="skills" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-foreground text-sm font-semibold">
                已绑定技能 ({boundSkills.length})
              </h3>
            </div>

            {boundSkills.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {boundSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="bg-card border-border hover:border-brand/30 rounded-xl border p-4 transition-colors group"
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
                          <span className={cn(
                            "rounded text-[10px] px-1.5 py-px",
                            skill.source === "BUILTIN"
                              ? "bg-blue-500/10 text-blue-400"
                              : skill.source === "CUSTOM"
                                ? "bg-green-500/10 text-green-400"
                                : "bg-purple-500/10 text-purple-400",
                          )}>
                            {skill.source === "BUILTIN" ? "内置" : skill.source === "CUSTOM" ? "自定义" : "外部"}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleUnbindSkill(skill.id)}
                        disabled={skillSubmitting}
                        className="shrink-0 text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Puzzle}
                title="暂无绑定技能"
                description="点击下方「+ 绑定技能」为该智能体关联可用技能。"
              />
            )}

            {/* 技能选择器 */}
            {availableSkills.length > 0 && (
              <div className="bg-accent/10 border-border rounded-xl border p-4 space-y-3">
                <h4 className="text-foreground text-xs font-semibold">
                  可用技能 ({availableSkills.length})
                </h4>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {availableSkills.map((skill) => (
                    <div
                      key={skill.id}
                      className="flex items-center justify-between gap-3 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground text-sm truncate">{skill.name}</p>
                        <p className="text-hint text-xs mt-0.5 truncate">
                          {skill.description}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleBindSkill(skill.id)}
                        disabled={skillSubmitting}
                        className="shrink-0 h-7 text-xs"
                      >
                        <Plus className="size-3 mr-1" />
                        绑定
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {skillSubmitting && (
              <div className="flex items-center gap-2 text-hint text-xs">
                <Loader2 className="size-3.5 animate-spin" />
                提交中…
              </div>
            )}
          </TabsContent>

          {/* ======================== 连接器 ======================== */}
          <TabsContent value="connectors" className="space-y-4">
            <h3 className="text-foreground text-sm font-semibold">
              已绑定连接器 ({currentConnectors.length})
            </h3>

            {currentConnectors.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentConnectors.map((connId, i) => {
                  const conn = allConnectors?.find((c) => c.id === connId);
                  return (
                    <div
                      key={connId}
                      className="bg-card border-border rounded-xl border p-4 hover:border-brand-blue/30 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-lg bg-brand-blue/10 flex items-center justify-center shrink-0 text-sm">
                          {conn?.iconEmoji ?? <Plug className="size-4 text-brand-blue" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground text-sm font-medium truncate">
                            {conn?.name ?? connId}
                          </p>
                          <p className="text-hint text-xs mt-0.5">
                            {conn?.category ?? "未知类别"}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveConnector(connId)}
                          disabled={connectorSubmitting}
                          className="shrink-0 text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={Plug}
                title="暂无绑定连接器"
                description="智能体可绑定 Gmail、CRM、Slack 等外部连接器。"
              />
            )}

            {/* 连接器选择器 */}
            {allConnectors && allConnectors.length > 0 && (
              <div className="bg-accent/10 border-border rounded-xl border p-4 space-y-3">
                <h4 className="text-foreground text-xs font-semibold">
                  已安装连接器
                </h4>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {allConnectors
                    .filter((c) => !currentConnectors.includes(c.id))
                    .map((conn) => (
                      <div
                        key={conn.id}
                        className="flex items-center justify-between gap-3 py-1.5"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-sm shrink-0">{conn.iconEmoji}</span>
                          <div className="min-w-0">
                            <p className="text-foreground text-sm truncate">{conn.name}</p>
                            <p className="text-hint text-xs truncate">{conn.category}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddConnector(conn.id)}
                          disabled={connectorSubmitting}
                          className="shrink-0 h-7 text-xs"
                        >
                          <Plus className="size-3 mr-1" />
                          绑定
                        </Button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {connectorSubmitting && (
              <div className="flex items-center gap-2 text-hint text-xs">
                <Loader2 className="size-3.5 animate-spin" />
                提交中…
              </div>
            )}
          </TabsContent>

          {/* ======================== 记忆权限 ======================== */}
          <TabsContent value="memory" className="space-y-6">
            <div className="bg-card border-border rounded-2xl border p-5">
              <h3 className="text-foreground text-sm font-semibold mb-4">
                当前记忆权限:{" "}
                <span className={cn(
                  "font-mono px-2 py-0.5 rounded text-xs",
                  memoryPerm === "read-write" && "bg-success/10 text-success",
                  memoryPerm === "read" && "bg-brand-blue/10 text-brand-blue",
                  memoryPerm === "none" && "bg-muted/50 text-muted-foreground",
                )}>
                  {memoryPerm === "read-write" ? "读写" : memoryPerm === "read" ? "只读" : "无权限"}
                </span>
              </h3>

              <div className="space-y-3">
                {[
                  {
                    key: "short",
                    label: "短期记忆",
                    desc: "当前会话上下文，任务结束后可选择性沉淀",
                    icon: Clock,
                  },
                  {
                    key: "mid",
                    label: "中期记忆",
                    desc: "项目空间内共享的项目级知识与经验",
                    icon: Brain,
                  },
                  {
                    key: "long",
                    label: "长期记忆",
                    desc: "跨项目的企业级知识资产与最佳实践",
                    icon: ScrollText,
                  },
                  {
                    key: "frozen",
                    label: "冻结记忆",
                    desc: "只读归档，不可修改的历史快照记忆体",
                    icon: Shield,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const checked = memToggles[item.key as keyof typeof memToggles];
                  return (
                    <div
                      key={item.key}
                      className="bg-accent/20 border-border flex items-center justify-between rounded-xl border p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="size-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                          <Icon className="size-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-foreground text-sm font-medium">{item.label}</p>
                          <p className="text-hint text-xs">{item.desc}</p>
                        </div>
                      </div>
                      <Tooltip>
                        <TooltipTrigger>
                          <div
                            className={cn(
                              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors",
                              checked
                                ? "border-brand bg-brand"
                                : "border-muted-foreground/30 bg-muted",
                              memoryPerm === "none" && item.key !== "short" && "opacity-40 pointer-events-none",
                            )}
                            onClick={() =>
                              setMemToggles((prev) => ({
                                ...prev,
                                [item.key]: !checked,
                              }))
                            }
                          >
                            <span
                              className={cn(
                                "size-3.5 rounded-full bg-white shadow-sm transition-transform",
                                checked ? "translate-x-4" : "translate-x-0.5",
                              )}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">
                          {checked ? "已启用" : "已禁用"} — 此开关展示记忆分级概念，
                          实际权限由后端 Agent.memoryPermission 字段控制
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>

              <p className="text-hint text-[11px] mt-4 border-t border-border/40 pt-3">
                提示：以上 Toggle 用于展示记忆分级概念，实际权限由智能体的{" "}
                <code className="bg-accent px-1 py-0.5 rounded text-[10px]">memoryPermission</code>{" "}
                字段控制（"read" / "read-write" / "none"）。
              </p>
            </div>
          </TabsContent>

          {/* ======================== 运行日志 ======================== */}
          <TabsContent value="logs">
            {logsLoading ? (
              <TabSkeleton rows={5} />
            ) : logsError ? (
              <div className="border-danger/30 bg-danger/5 flex items-center gap-2 rounded-xl border px-4 py-3">
                <AlertTriangle className="text-danger size-4 shrink-0" />
                <p className="text-danger text-sm">运行日志加载失败，请稍后重试</p>
              </div>
            ) : logs && logs.length > 0 ? (
              <div className="border-border overflow-hidden rounded-xl border">
                {logs.map((log, i) => {
                  const statusMeta =
                    LOG_STATUS_META[log.status] ?? {
                      label: log.status,
                      className: "bg-warning/10 text-warning",
                    };
                  return (
                    <div
                      key={log.id}
                      className={cn(
                        "border-border flex items-center gap-3 px-4 py-2.5 font-mono text-xs",
                        i < logs.length - 1 && "border-b",
                      )}
                    >
                      <span className="text-hint shrink-0 w-28">
                        {formatDate(log.createdAt)}
                      </span>
                      <span className="text-muted-foreground min-w-0 flex-1 truncate">
                        {log.detail || log.taskName}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                          statusMeta.className,
                        )}
                      >
                        {statusMeta.label}
                      </span>
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
                          {log.riskLevel === "high"
                            ? "高风险"
                            : log.riskLevel === "medium"
                              ? "中风险"
                              : "低风险"}
                        </span>
                      )}
                      {log.workflowRunId && (
                        <Link
                          href={`/workspace/agents/${currentAgent.id}`}
                          className="text-brand hover:underline shrink-0 text-[10px]"
                        >
                          <ExternalLink className="size-3 inline mr-0.5" />
                          {log.workflowRunId.slice(0, 8)}…
                        </Link>
                      )}
                      <span className="text-hint w-16 shrink-0 text-right tabular-nums">
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
                description="该智能体执行任务后，运行日志将在此留痕。"
              />
            )}
          </TabsContent>

          {/* ======================== Harness 版本 ======================== */}
          <TabsContent value="harness" className="space-y-5">
            <div className="bg-card border-border rounded-2xl border p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-foreground text-sm font-semibold">
                    当前 Harness 版本
                  </h3>
                  <p className="text-hint text-xs mt-1">
                    创建于 {formatDate(currentAgent.createdAt)} · 最后活跃{" "}
                    {formatDate(currentAgent.lastActive)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <AutomationLevelBadge level={level} />
                  <span className="bg-brand/10 text-brand rounded-lg px-3 py-1.5 text-sm font-mono font-semibold">
                    v{currentAgent.harnessVersion}
                  </span>
                </div>
              </div>
            </div>

            {/* Harness 六大组件 */}
            <div className="bg-card border-border rounded-2xl border p-5">
              <h3 className="text-foreground text-sm font-semibold mb-4">
                自动化授权等级（AGENTS.md §5.2）
              </h3>
              <div className="space-y-3">
                {(["L1", "L2", "L3", "L4"] as const).map((l) => {
                  const m = AUTOMATION_LEVEL_META_V2[l];
                  const isCurrent = level === l;
                  return (
                    <div
                      key={l}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-3 transition-colors",
                        isCurrent
                          ? cn(m.className, "border-2")
                          : "border-border bg-card",
                      )}
                    >
                      <div
                        className={cn(
                          "size-7 rounded-lg flex items-center justify-center shrink-0",
                          m.className,
                        )}
                      >
                        <span className="text-xs font-mono font-bold">{l}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground text-xs font-medium">
                            {m.label}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] rounded px-1.5 py-0.5 font-medium bg-brand/10 text-brand">
                              当前等级
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground text-xs mt-1">{m.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-card border-border rounded-2xl border p-5">
              <h3 className="text-foreground text-sm font-semibold mb-3">
                Harness 六大组件
              </h3>
              <div className="space-y-2">
                {[
                  { name: "任务边界", desc: "canDo / cannotDo 声明", ver: "v1.0.0" },
                  { name: "上下文供给链", desc: "知识版本化与 KCL 记录", ver: "v1.0.0" },
                  { name: "受控工具接入", desc: "ToolRegistry + 短期 Token", ver: "v1.0.0" },
                  { name: "闭环反馈", desc: "AgentLog + AuditLog 留痕", ver: "v1.0.0" },
                  { name: "安全护栏", desc: "置信度/高危门禁/L1-L4 授权", ver: "v1.0.0" },
                  { name: "进化调度器", desc: "72h 自动评估 + HEP 提案", ver: "v1.0.0" },
                ].map((comp) => (
                  <div
                    key={comp.name}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div>
                      <span className="text-foreground text-sm">{comp.name}</span>
                      <span className="text-hint text-xs ml-2">{comp.desc}</span>
                    </div>
                    <span className="text-hint text-xs font-mono">{comp.ver}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ---- 快照时间线 ---- */}
            <div className="bg-card border-border rounded-2xl border p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-foreground text-sm font-semibold flex items-center gap-2">
                  <History className="size-4 text-muted-foreground" />
                  Harness 快照历史
                </h3>
                <span className="text-hint text-xs">
                  {snapshotsLoading ? "加载中…" : `${snapshots?.length ?? 0} 个版本`}
                </span>
              </div>

              {snapshotsLoading ? (
                <TabSkeleton rows={3} />
              ) : snapshots && snapshots.length > 0 ? (
                <div className="relative pl-6 border-l-2 border-border space-y-4">
                  {snapshots.map((snap, i) => {
                    const statusMeta =
                      SNAPSHOT_STATUS_META[snap.status] ?? {
                        label: snap.status,
                        className: "bg-muted/50 text-muted-foreground border-border",
                        icon: Clock,
                      };
                    const StatusIcon = statusMeta.icon;
                    const isActive = snap.status === "active";
                    const typeLabel =
                      SNAPSHOT_TYPE_LABELS[snap.snapshotType] ?? snap.snapshotType;

                    return (
                      <div key={snap.snapshotId} className="relative">
                        {/* 时间线圆点 */}
                        <div
                          className={cn(
                            "absolute -left-[29px] top-1 size-4 rounded-full border-2 flex items-center justify-center",
                            isActive
                              ? "bg-success border-success ring-2 ring-success/20"
                              : snap.status === "rolled-back-to"
                                ? "bg-warning border-warning"
                                : "bg-card border-border",
                          )}
                        >
                          {isActive && (
                            <span className="size-1.5 rounded-full bg-white" />
                          )}
                        </div>

                        <div
                          className={cn(
                            "bg-card rounded-xl border p-4 transition-colors",
                            isActive
                              ? "border-success/40 bg-success/5"
                              : snap.status === "rolled-back-to"
                                ? "border-warning/30 bg-warning/5"
                                : "border-border hover:border-brand/30",
                          )}
                        >
                          {/* 头部 */}
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-foreground text-sm font-mono font-semibold">
                                v{snap.policySnapshotVersion}
                              </span>
                              <span
                                className={cn(
                                  "rounded-full border px-2 py-0.5 text-[10px] font-medium inline-flex items-center gap-1",
                                  statusMeta.className,
                                )}
                              >
                                <StatusIcon className="size-2.5" />
                                {statusMeta.label}
                              </span>
                              <span className="text-hint text-[10px] bg-muted/50 rounded px-1.5 py-0.5">
                                {typeLabel}
                              </span>
                            </div>
                            {!isActive && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRollbackInitiate(snap)}
                                disabled={rollbackSubmitting}
                                className="shrink-0 h-7 text-xs border-warning/40 text-warning hover:bg-warning/10 hover:border-warning"
                              >
                                <RotateCcw className="size-3 mr-1" />
                                回滚至此
                              </Button>
                            )}
                          </div>

                          {/* 摘要 */}
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                            <span>
                              {snap.summary.skillCount} 技能 · {snap.summary.connectorCount} 连接器
                            </span>
                            <span>
                              canDo {snap.summary.canDoCount} · cannotDo {snap.summary.cannotDoCount}
                            </span>
                            <AutomationLevelBadge
                              level={snap.summary.automationLevel}
                              className="scale-90 origin-left"
                            />
                          </div>

                          {/* 底部元信息 */}
                          <div className="mt-2 flex items-center gap-3 text-[10px] text-hint border-t border-border/40 pt-2">
                            <span>{formatDate(snap.createdAt)}</span>
                            <span>·</span>
                            <span>{snap.createdBy}</span>
                            {snap.restoredAt && (
                              <>
                                <span>·</span>
                                <span className="text-warning">
                                  回滚于 {formatDate(snap.restoredAt)} by {snap.restoredBy}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Canary 进度 (snapshotType 包含 canary 时展示示意进度条) */}
                          {snap.snapshotType === "pre-canary" && !isActive && (
                            <div className="mt-2 bg-accent/30 rounded-lg p-2 border border-border/50">
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                                <span className="flex items-center gap-1">
                                  <Activity className="size-3" />
                                  Canary 灰度评估
                                </span>
                                <span>已取代（由后续快照覆盖）</span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-muted-foreground/40 h-full rounded-full"
                                  style={{ width: "100%" }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={History}
                  title="暂无快照记录"
                  description="该智能体尚未创建 Harness 快照，快照在提案通过或手动触发时自动生成。"
                />
              )}
            </div>

            {/* ---- Rollback 确认 Modal ---- */}
            {confirmTarget && (
              <div className="fixed inset-0 z-50 flex items-center justify-center">
                {/* 遮罩 */}
                <div
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={handleRollbackCancel}
                />
                {/* 弹窗 */}
                <div className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4 animate-in zoom-in-95 duration-200">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="size-10 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                      <RotateCcw className="size-5 text-warning" />
                    </div>
                    <div>
                      <h3 className="text-foreground text-sm font-semibold">
                        确认回滚操作
                      </h3>
                      <p className="text-hint text-xs mt-0.5">
                        此操作属于高危变更，将恢复 Harness 至目标快照版本
                      </p>
                    </div>
                  </div>

                  {/* Diff 摘要 */}
                  <div className="bg-accent/20 border border-border rounded-xl p-4 space-y-2 mb-4">
                    <h4 className="text-foreground text-xs font-semibold flex items-center gap-1.5">
                      <GitBranch className="size-3.5" />
                      目标快照 v{confirmTarget.policySnapshotVersion}
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Puzzle className="size-3 text-muted-foreground" />
                        <span className="text-muted-foreground">技能:</span>
                        <span className="text-foreground font-medium">
                          {confirmTarget.summary.skillCount} 个
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Plug className="size-3 text-muted-foreground" />
                        <span className="text-muted-foreground">连接器:</span>
                        <span className="text-foreground font-medium">
                          {confirmTarget.summary.connectorCount} 个
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Shield className="size-3 text-muted-foreground" />
                        <span className="text-muted-foreground">自动化:</span>
                        <AutomationLevelBadge
                          level={confirmTarget.summary.automationLevel}
                          className="scale-90 origin-left"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Info className="size-3 text-muted-foreground" />
                        <span className="text-muted-foreground">来源:</span>
                        <span className="text-foreground font-medium">
                          {SNAPSHOT_TYPE_LABELS[confirmTarget.snapshotType] ?? confirmTarget.snapshotType}
                        </span>
                      </div>
                    </div>
                    <p className="text-hint text-[10px] mt-1 border-t border-border/40 pt-1.5">
                      创建于 {formatDate(confirmTarget.createdAt)} by {confirmTarget.createdBy}
                    </p>
                  </div>

                  <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                    回滚将恢复此智能体的 Harness 配置（技能绑定、连接器绑定、自动化等级、
                    任务边界等）至快照 <code className="bg-accent px-1 py-0.5 rounded text-xs font-mono">{confirmTarget.snapshotId.slice(0, 8)}…</code> 的状态。
                    此操作需要 ADMIN 权限，并由系统记录审计日志。
                  </p>

                  <div className="flex gap-3 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRollbackCancel}
                      disabled={rollbackSubmitting}
                    >
                      取消
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleRollbackConfirm}
                      disabled={rollbackSubmitting}
                    >
                      {rollbackSubmitting ? (
                        <Loader2 className="size-4 mr-1.5 animate-spin" />
                      ) : (
                        <RotateCcw className="size-4 mr-1.5" />
                      )}
                      确认回滚
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  );
}
