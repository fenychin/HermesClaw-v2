"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  GitBranch,
  RotateCcw,
  ArrowUpCircle,
  Loader2,
  History,
  Zap,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HarnessStatusBadge, HARNESS_STATUS_META } from "./HarnessStatusBadge";
import {
  AutomationLevelBadge,
  AUTOMATION_LEVEL_META_V2,
} from "./AutomationLevelBadge";
import type { HarnessStatusValue, AgentRiskLevel } from "@/types";

// ==============================
// 类型定义
// ==============================

interface GovernanceData {
  agent: {
    id: string
    name: string
    role: string
    status: string
    automationLevel: string
    harnessVersion: string
  }
  harnessStatus: HarnessStatusValue
  riskLevel: string
  latestSnapshot: {
    snapshotId: string
    snapshotType: string
    status: string
    policySnapshotVersion: string
    createdAt: string
    summary: {
      skillCount: number
      connectorCount: number
      automationLevel: string
    }
  } | null
  activeCanary: {
    canaryId: string
    proposalId: string
    status: string
    trafficPercent: number
    errorRate?: number
    successRate?: number
    startedAt: string
    endsAt: string
  } | null
  recentProposals: Array<{
    proposalId: string
    title: string
    status: string
    severity: string
    proposalType: string
    createdAt: string
  }>
  recentAuditLogs: Array<{
    id: string
    action: string
    detail: string | null
    riskLevel: string | null
    status: string
    createdAt: string
  }>
  recentWorkflowRuns: Array<{
    runId: string
    workflowId: string
    status: string
    triggerType: string
    errorMessage: string | null
    startedAt: string | null
    completedAt: string | null
    durationMs: number | null
  }>
  bindings: {
    skillCount: number
    connectorCount: number
    skillNames: string[]
    connectorNames: string[]
  }
}

// ==============================
// 工具函数
// ==============================

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = d.getHours().toString().padStart(2, "0");
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${mm}月${dd}日 ${hh}:${min}`;
}

function formatTimeRemaining(endsAt: string): string {
  const remaining = new Date(endsAt).getTime() - Date.now();
  if (remaining <= 0) return "已到期";
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  if (hours > 0) return `剩余 ${hours}h ${minutes}m`;
  return `剩余 ${minutes}m`;
}

function riskLevelMeta(level: string): { label: string; className: string; icon: typeof AlertTriangle } {
  switch (level) {
    case "high":
      return { label: "高风险", className: "text-danger bg-danger/10 border-danger/30", icon: AlertTriangle };
    case "medium":
      return { label: "中风险", className: "text-warning bg-warning/10 border-warning/30", icon: AlertTriangle };
    default:
      return { label: "低风险", className: "text-success bg-success/10 border-success/30", icon: CheckCircle2 };
  }
}

function canaryStatusLabel(status: string): string {
  switch (status) {
    case "running": return "灰度运行中";
    case "promoting": return "晋级中";
    case "rolling-back": return "回滚中";
    default: return status;
  }
}

// ==============================
// 提案状态映射
// ==============================

const PROPOSAL_STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: "草稿", className: "bg-slate-100 text-slate-600" },
  pending: { label: "待审批", className: "bg-amber-100 text-amber-700" },
  approved: { label: "已批准", className: "bg-blue-100 text-blue-700" },
  canary: { label: "灰度中", className: "bg-purple-100 text-purple-700" },
  active: { label: "生效中", className: "bg-green-100 text-green-700" },
  rejected: { label: "已拒绝", className: "bg-red-100 text-red-700" },
  rolled_back: { label: "已回滚", className: "bg-red-100 text-red-700" },
  deprecated: { label: "已弃用", className: "bg-gray-100 text-gray-500" },
};

// ==============================
// 主组件
// ==============================

interface GovernanceTabProps {
  agentId: string;
}

export function GovernanceTab({ agentId }: GovernanceTabProps) {
  const queryClient = useQueryClient();

  // ---- 治理数据 ----
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["agent-governance", agentId],
    queryFn: async (): Promise<GovernanceData> => {
      const res = await fetch(`/api/agents/${agentId}/governance`);
      if (!res.ok) throw new Error("加载治理状态失败");
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "加载失败");
      return json.data.governance as GovernanceData;
    },
    staleTime: 30_000,
  });

  // ---- 触发提案对话框 ----
  const [proposeOpen, setProposeOpen] = useState(false);
  const [targetLevel, setTargetLevel] = useState<string>("");
  const [proposeReason, setProposeReason] = useState("");
  const [proposeConfirm, setProposeConfirm] = useState(false);
  const [proposeSubmitting, setProposeSubmitting] = useState(false);

  const handlePropose = useCallback(async () => {
    if (!targetLevel || !proposeReason.trim()) return;
    setProposeSubmitting(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetAutomationLevel: targetLevel,
          reason: proposeReason.trim(),
          confirm: proposeConfirm || undefined,
        }),
      });
      const json = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !json.success) {
        // 409 → 需要二次确认
        if (res.status === 409 && json.requiresConfirmation) {
          setProposeConfirm(true);
          toast.warning("高风险操作，请勾选确认后再提交");
          setProposeSubmitting(false);
          return;
        }
        throw new Error(json.error ?? "提交失败");
      }
      toast.success(json.data?.message ?? `提案已提交: ${json.data?.proposalId}`);
      setProposeOpen(false);
      setTargetLevel("");
      setProposeReason("");
      setProposeConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["agent-governance", agentId] });
      queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "触发提案失败");
    } finally {
      setProposeSubmitting(false);
    }
  }, [agentId, targetLevel, proposeReason, proposeConfirm, queryClient]);

  // ---- Canary 决策 ----
  const [canarySubmitting, setCanarySubmitting] = useState(false);
  const [canaryConfirm, setCanaryConfirm] = useState(false);

  const handleCanaryDecide = useCallback(
    async (decision: "approve" | "reject") => {
      if (!data?.activeCanary) return;
      setCanarySubmitting(true);
      try {
        const res = await fetch(`/api/agents/${agentId}/canary/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canaryId: data.activeCanary.canaryId,
            decision,
            confirm: canaryConfirm || undefined,
          }),
        });
        const json = await res.json().catch(() => ({ success: false }));
        if (!res.ok || !json.success) {
          if (res.status === 409 && json.requiresConfirmation) {
            setCanaryConfirm(true);
            toast.warning("高风险操作，请勾选确认后再提交");
            setCanarySubmitting(false);
            return;
          }
          throw new Error(json.error ?? "决策失败");
        }
        toast.success(json.data?.message ?? "Canary 决策已执行");
        setCanaryConfirm(false);
        queryClient.invalidateQueries({ queryKey: ["agent-governance", agentId] });
        queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Canary 决策失败");
      } finally {
        setCanarySubmitting(false);
      }
    },
    [agentId, data?.activeCanary, canaryConfirm, queryClient],
  );

  // ======================== 渲染 ========================

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card border-border rounded-xl border p-5 animate-pulse">
            <div className="h-4 w-2/3 rounded bg-accent mb-3" />
            <div className="h-3 w-1/2 rounded bg-accent" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-danger/30 bg-danger/5 flex items-center gap-2 rounded-xl border px-4 py-3">
        <AlertTriangle className="text-danger size-4 shrink-0" />
        <p className="text-danger text-sm">
          {error instanceof Error ? error.message : "加载治理状态失败"}
        </p>
      </div>
    );
  }

  if (!data) return null;

  const gov = data;
  const riskMeta = riskLevelMeta(gov.riskLevel);
  const RiskIcon = riskMeta.icon;
  const harnessStatus = (gov.harnessStatus as HarnessStatusValue) ?? "none";
  const harnessMeta = HARNESS_STATUS_META[harnessStatus] ?? HARNESS_STATUS_META.none;

  return (
    <div className="space-y-5">
      {/* ==================== 治理概览卡片 ==================== */}
      <div className="bg-card border-border rounded-2xl border p-5">
        <h3 className="text-foreground text-sm font-semibold mb-4 flex items-center gap-2">
          <Shield className="size-4 text-muted-foreground" />
          治理概览
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Harness 状态 */}
          <div className="bg-accent/20 rounded-xl p-3">
            <p className="text-hint text-[11px] mb-1">治理状态</p>
            <HarnessStatusBadge status={harnessStatus} size="md" />
          </div>

          {/* 风险等级 */}
          <div className="bg-accent/20 rounded-xl p-3">
            <p className="text-hint text-[11px] mb-1">风险等级</p>
            <div className="flex items-center gap-1.5">
              <RiskIcon className={cn("size-3.5", riskMeta.className.replace(/bg-\S+|\s*border-\S+/g, "").trim())} />
              <span className={cn("text-sm font-semibold", riskMeta.className.replace(/bg-\S+|\s*border-\S+/g, "").trim())}>
                {riskMeta.label}
              </span>
            </div>
          </div>

          {/* 自动化等级 */}
          <div className="bg-accent/20 rounded-xl p-3">
            <p className="text-hint text-[11px] mb-1">自动化等级</p>
            <AutomationLevelBadge level={gov.agent.automationLevel} />
          </div>

          {/* Harness 版本 */}
          <div className="bg-accent/20 rounded-xl p-3">
            <p className="text-hint text-[11px] mb-1">Harness 版本</p>
            <span className="text-foreground text-sm font-mono font-semibold">
              v{gov.agent.harnessVersion}
            </span>
          </div>
        </div>

        {/* 绑定摘要 */}
        <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span>
            <span className="text-hint">技能绑定:</span>{" "}
            <span className="text-foreground font-medium">{gov.bindings.skillCount} 个</span>
            {gov.bindings.skillNames.length > 0 && (
              <span className="text-hint ml-1">({gov.bindings.skillNames.slice(0, 3).join("、")}{gov.bindings.skillNames.length > 3 ? "…" : ""})</span>
            )}
          </span>
          <span>
            <span className="text-hint">连接器绑定:</span>{" "}
            <span className="text-foreground font-medium">{gov.bindings.connectorCount} 个</span>
            {gov.bindings.connectorNames.length > 0 && (
              <span className="text-hint ml-1">({gov.bindings.connectorNames.slice(0, 3).join("、")}{gov.bindings.connectorNames.length > 3 ? "…" : ""})</span>
            )}
          </span>
          {gov.latestSnapshot && (
            <span>
              <span className="text-hint">最新快照:</span>{" "}
              <span className="text-foreground font-mono font-medium">
                v{gov.latestSnapshot.policySnapshotVersion}
              </span>
              <span className="text-hint ml-1">({formatDate(gov.latestSnapshot.createdAt)})</span>
            </span>
          )}
        </div>
      </div>

      {/* ==================== 活跃 Canary 卡片 ==================== */}
      {gov.activeCanary ? (
        <div className="bg-card border-purple-300/50 dark:border-purple-700/30 rounded-2xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground text-sm font-semibold flex items-center gap-2">
              <Activity className="size-4 text-purple-500" />
              活跃灰度发布
              <span className="text-[10px] rounded px-1.5 py-0.5 font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400">
                {canaryStatusLabel(gov.activeCanary.status)}
              </span>
            </h3>
            <span className="text-hint text-xs">
              {formatTimeRemaining(gov.activeCanary.endsAt)}
            </span>
          </div>

          {/* Canary 指标 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-accent/20 rounded-xl p-3">
              <p className="text-hint text-[11px]">流量占比</p>
              <p className="text-foreground text-lg font-semibold tabular-nums">
                {gov.activeCanary.trafficPercent}%
              </p>
            </div>
            <div className="bg-accent/20 rounded-xl p-3">
              <p className="text-hint text-[11px]">成功率</p>
              <p className={cn(
                "text-lg font-semibold tabular-nums",
                (gov.activeCanary.successRate ?? 0) >= 0.9 ? "text-success" : "text-warning",
              )}>
                {gov.activeCanary.successRate != null
                  ? `${(gov.activeCanary.successRate * 100).toFixed(1)}%`
                  : "—"}
              </p>
            </div>
            <div className="bg-accent/20 rounded-xl p-3">
              <p className="text-hint text-[11px]">错误率</p>
              <p className={cn(
                "text-lg font-semibold tabular-nums",
                (gov.activeCanary.errorRate ?? 0) <= 0.1 ? "text-success" : "text-danger",
              )}>
                {gov.activeCanary.errorRate != null
                  ? `${(gov.activeCanary.errorRate * 100).toFixed(1)}%`
                  : "—"}
              </p>
            </div>
            <div className="bg-accent/20 rounded-xl p-3">
              <p className="text-hint text-[11px]">Canary ID</p>
              <p className="text-foreground text-xs font-mono truncate" title={gov.activeCanary.canaryId}>
                {gov.activeCanary.canaryId.slice(0, 12)}…
              </p>
            </div>
          </div>

          {/* 进度条 */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
              <span>灰度观察窗口</span>
              <span>
                {formatDate(gov.activeCanary.startedAt)} → {formatDate(gov.activeCanary.endsAt)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              {(() => {
                const total = new Date(gov.activeCanary.endsAt).getTime() - new Date(gov.activeCanary.startedAt).getTime();
                const elapsed = Date.now() - new Date(gov.activeCanary.startedAt).getTime();
                const pct = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 100;
                return (
                  <div
                    className="bg-purple-500 h-full rounded-full transition-all duration-1000"
                    style={{ width: `${pct}%` }}
                  />
                );
              })()}
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={canaryConfirm}
                onChange={(e) => setCanaryConfirm(e.target.checked)}
                className="size-3.5 rounded border-border accent-brand"
              />
              确认此操作
            </label>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleCanaryDecide("reject")}
              disabled={canarySubmitting}
              className="h-8 text-xs"
            >
              {canarySubmitting ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <XCircle className="size-3.5 mr-1" />}
              拒绝并回滚
            </Button>
            <Button
              size="sm"
              onClick={() => handleCanaryDecide("approve")}
              disabled={canarySubmitting}
              className="h-8 text-xs bg-success hover:bg-success/90 text-white"
            >
              {canarySubmitting ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="size-3.5 mr-1" />}
              批准晋级
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-card border-border rounded-2xl border p-5">
          <h3 className="text-foreground text-sm font-semibold flex items-center gap-2 mb-2">
            <Activity className="size-4 text-muted-foreground" />
            活跃灰度发布
          </h3>
          <p className="text-hint text-xs">暂无进行中的灰度发布</p>
        </div>
      )}

      {/* ==================== 最近提案列表 ==================== */}
      <div className="bg-card border-border rounded-2xl border p-5">
        <h3 className="text-foreground text-sm font-semibold flex items-center gap-2 mb-3">
          <GitBranch className="size-4 text-muted-foreground" />
          最近治理提案
        </h3>

        {gov.recentProposals.length > 0 ? (
          <div className="space-y-2">
            {gov.recentProposals.map((p) => {
              const statusMeta = PROPOSAL_STATUS_META[p.status] ?? {
                label: p.status,
                className: "bg-muted/50 text-muted-foreground",
              };
              return (
                <div
                  key={p.proposalId}
                  className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-sm font-medium truncate">
                        {p.title}
                      </span>
                      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", statusMeta.className)}>
                        {statusMeta.label}
                      </span>
                    </div>
                    <p className="text-hint text-[11px] mt-0.5">
                      <span className="font-mono">{p.proposalId}</span>
                      <span className="mx-1.5">·</span>
                      {formatDate(p.createdAt)}
                      <span className="mx-1.5">·</span>
                      严重度: {p.severity === "high" ? "高" : p.severity === "medium" ? "中" : "低"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-hint text-xs">暂无治理提案</p>
        )}
      </div>

      {/* ==================== WorkflowRun 执行证据 ==================== */}
      <div className="bg-card border-border rounded-2xl border p-5">
        <h3 className="text-foreground text-sm font-semibold flex items-center gap-2 mb-3">
          <Activity className="size-4 text-muted-foreground" />
          最近执行记录（WorkflowRun）
        </h3>

        {gov.recentWorkflowRuns.length > 0 ? (
          <div className="space-y-2">
            {gov.recentWorkflowRuns.map((r) => {
              const statusMeta: Record<string, { label: string; className: string }> = {
                completed: { label: "完成", className: "bg-success/10 text-success" },
                failed: { label: "失败", className: "bg-danger/10 text-danger" },
                running: { label: "运行中", className: "bg-blue-500/10 text-blue-500" },
                cancelled: { label: "已取消", className: "bg-muted/50 text-muted-foreground" },
                pending: { label: "等待中", className: "bg-warning/10 text-warning" },
              };
              const sm = statusMeta[r.status] ?? { label: r.status, className: "bg-muted/50 text-muted-foreground" };
              const durationStr =
                r.durationMs != null
                  ? r.durationMs >= 1000
                    ? `${(r.durationMs / 1000).toFixed(1)}s`
                    : `${r.durationMs}ms`
                  : "—";
              return (
                <div
                  key={r.runId}
                  className="flex items-center gap-3 py-2 border-b border-border last:border-0 text-xs"
                >
                  <span className="text-hint shrink-0 w-20 font-mono">
                    {formatDate(r.startedAt)}
                  </span>
                  <span className="text-foreground font-mono text-[11px] shrink-0" title={r.runId}>
                    {r.runId.slice(0, 10)}…
                  </span>
                  <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", sm.className)}>
                    {sm.label}
                  </span>
                  <span className="text-muted-foreground truncate flex-1 hidden sm:inline">
                    {r.triggerType === "agent-dispatch"
                      ? "Agent 调度"
                      : r.triggerType === "scheduled"
                        ? "定时触发"
                        : r.triggerType === "event"
                          ? "事件触发"
                          : "手动触发"}
                  </span>
                  <span className="text-hint shrink-0 tabular-nums">{durationStr}</span>
                  {r.errorMessage && (
                    <span className="text-danger shrink-0 text-[10px] truncate max-w-[120px]" title={r.errorMessage}>
                      {r.errorMessage}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-hint text-xs">暂无 WorkflowRun 执行记录</p>
        )}

        <p className="text-hint text-[11px] mt-3 pt-2 border-t border-border/40">
          以上为与该智能体直接关联的最近工作流运行，每一条对应一次真实的任务分派与执行。
        </p>
      </div>

      {/* ==================== 操作面板 ==================== */}
      <div className="bg-card border-border rounded-2xl border p-5">
        <h3 className="text-foreground text-sm font-semibold flex items-center gap-2 mb-4">
          <Zap className="size-4 text-muted-foreground" />
          治理操作
        </h3>

        <div className="flex flex-wrap gap-3">
          {/* 触发升级提案 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProposeOpen(true)}
            className="h-9"
          >
            <ArrowUpCircle className="size-4 mr-1.5" />
            触发升级提案
          </Button>

          {/* 回滚入口 */}
          <Button
            variant="outline"
            size="sm"
            className="h-9 border-warning/30 text-warning hover:bg-warning/10"
            onClick={() => {
              // 切换到 Harness Tab（通过触发自定义事件）
              const tabs = document.querySelector<HTMLButtonElement>('[data-value="harness"]');
              tabs?.click();
            }}
          >
            <RotateCcw className="size-4 mr-1.5" />
            查看快照与回滚
          </Button>
        </div>

        {/* 触发提案对话框 */}
        {proposeOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => { setProposeOpen(false); setProposeConfirm(false); }}
            />
            <div className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="size-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                  <ArrowUpCircle className="size-5 text-brand" />
                </div>
                <div>
                  <h3 className="text-foreground text-sm font-semibold">触发自动化等级升级提案</h3>
                  <p className="text-hint text-xs mt-0.5">
                    当前等级: {gov.agent.automationLevel}
                  </p>
                </div>
              </div>

              {/* 目标等级选择 */}
              <div className="space-y-3 mb-4">
                <label className="text-foreground text-xs font-medium">目标等级</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["L1", "L2", "L3", "L4"] as const).map((l) => {
                    const m = AUTOMATION_LEVEL_META_V2[l];
                    const isCurrent = l === gov.agent.automationLevel;
                    const levelOrder = { L1: 0, L2: 1, L3: 2, L4: 3 };
                    const currentOrder = levelOrder[gov.agent.automationLevel as keyof typeof levelOrder] ?? 0;
                    const targetOrder = levelOrder[l];
                    const disabled = isCurrent || targetOrder < currentOrder;
                    return (
                      <button
                        key={l}
                        type="button"
                        disabled={disabled}
                        onClick={() => setTargetLevel(l)}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-all",
                          disabled && "opacity-40 cursor-not-allowed",
                          targetLevel === l
                            ? cn(m.className, "border-2")
                            : "border-border hover:border-brand/40",
                        )}
                      >
                        <span className={cn("text-xs font-mono font-bold", m.className.replace(/bg-\S+|dark:\S+/g, "").trim())}>
                          {l}
                        </span>
                        <span className="block text-xs text-foreground mt-0.5 font-medium">
                          {m.label}
                        </span>
                        <span className="block text-[10px] text-muted-foreground mt-0.5">
                          {m.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 原因 */}
              <div className="mb-4">
                <label className="text-foreground text-xs font-medium block mb-1.5">
                  提案原因 <span className="text-danger">*</span>
                </label>
                <textarea
                  className="w-full bg-accent/20 border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-hint resize-none focus:outline-none focus:border-brand"
                  rows={3}
                  placeholder="描述升级原因，如：该智能体已稳定运行 7 天，成功率 >95%…"
                  value={proposeReason}
                  onChange={(e) => setProposeReason(e.target.value)}
                />
              </div>

              {/* 确认框 */}
              {(targetLevel === "L3" || targetLevel === "L4") && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none mb-4">
                  <input
                    type="checkbox"
                    checked={proposeConfirm}
                    onChange={(e) => setProposeConfirm(e.target.checked)}
                    className="size-3.5 rounded border-border accent-brand"
                  />
                  我确认此操作属于高风险变更，将创建审批检查点
                </label>
              )}

              {targetLevel === "L4" && (
                <div className="border-danger/30 bg-danger/5 flex items-start gap-2 rounded-xl border px-3 py-2 mb-4">
                  <AlertTriangle className="text-danger size-4 shrink-0 mt-0.5" />
                  <p className="text-danger text-xs">
                    L4 为最高安全级，系统将硬阻止自动审批。此提案需要 ADMIN 角色手动审批。
                  </p>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setProposeOpen(false); setProposeConfirm(false); }}
                  disabled={proposeSubmitting}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={handlePropose}
                  disabled={!targetLevel || !proposeReason.trim() || proposeSubmitting}
                >
                  {proposeSubmitting ? (
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                  ) : (
                    <ArrowUpCircle className="size-4 mr-1.5" />
                  )}
                  提交提案
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== 最近审计日志 ==================== */}
      <div className="bg-card border-border rounded-2xl border p-5">
        <h3 className="text-foreground text-sm font-semibold flex items-center gap-2 mb-3">
          <History className="size-4 text-muted-foreground" />
          最近审计记录
        </h3>

        {gov.recentAuditLogs.length > 0 ? (
          <div className="space-y-2">
            {gov.recentAuditLogs.map((log) => {
              const logRiskMeta = log.riskLevel ? riskLevelMeta(log.riskLevel) : null;
              return (
                <div
                  key={log.id}
                  className="flex items-center gap-3 py-2 border-b border-border last:border-0 text-xs"
                >
                  <span className="text-hint shrink-0 w-20 font-mono">
                    {formatDate(log.createdAt)}
                  </span>
                  <span className="text-foreground font-mono text-[11px] min-w-0 truncate flex-1">
                    {log.action}
                  </span>
                  {log.detail && (
                    <span className="text-muted-foreground truncate max-w-[200px] hidden sm:inline">
                      {log.detail}
                    </span>
                  )}
                  {logRiskMeta && (
                    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", logRiskMeta.className)}>
                      {logRiskMeta.label}
                    </span>
                  )}
                  <span className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    log.status === "success"
                      ? "bg-success/10 text-success"
                      : log.status === "failed"
                        ? "bg-danger/10 text-danger"
                        : "bg-warning/10 text-warning",
                  )}>
                    {log.status === "success" ? "成功" : log.status === "failed" ? "失败" : "待处理"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-hint text-xs">暂无审计记录</p>
        )}
      </div>
    </div>
  );
}
