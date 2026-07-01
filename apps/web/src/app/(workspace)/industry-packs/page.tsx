"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Boxes,
  Zap,
  Trash2,
  Sparkles,
  Clock,
  History,
  Shield,
  ArrowLeftRight,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageTransition } from "@/components/common/PageTransition";
import { cn } from "@/lib/utils";

// ============================================================
// 类型定义
// ============================================================

interface PackInstallation {
  id: string;
  installationId: string;
  packId: string;
  packName: string;
  packVersion: string;
  status:
    | "installing"
    | "installed"
    | "uninstalling"
    | "uninstalled"
    | "failed"
    | "deprecated"
    | "paused";
  installedCapabilities: string;
  resolvedDependencies: string;
  manifest?: any;
  installedAt?: string | null;
  uninstalledAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

interface AvailablePack {
  packId: string;
  packName: string;
  version: string;
  description: string;
  targetIndustry: string;
  compatibleHermesApi: string;
  compatibleRuntimeApi: string;
  capabilityCount: number;
  agentCount: number;
}

interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  detail?: string;
  riskLevel?: string;
  status: string;
  contextSnapshot?: any;
  createdAt: string;
}

// ============================================================
// 工具函数
// ============================================================

function compareVersion(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** 从 manifest 原始字段中提取 API 版本字符串（{min, max} 对象 → min 值，字符串 → 原值） */
function extractApiVersion(raw: any): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null) {
    return raw.min || raw.version || "";
  }
  return "";
}

function getActionLabel(action: string): { label: string; color: string } {
  if (action.includes("install.started")) return { label: "安装开始", color: "text-blue-400" };
  if (action.includes("install.warning")) return { label: "安装警告", color: "text-yellow-400" };
  if (action.includes("install.failed") || action.includes("installation failed"))
    return { label: "安装失败", color: "text-red-400" };
  if (action.includes("installed") || action.includes("pack.installed"))
    return { label: "安装完成", color: "text-green-400" };
  if (action.includes("activate.started")) return { label: "激活开始", color: "text-blue-400" };
  if (action.includes("activated") || action.includes("pack.activate"))
    return { label: "激活完成", color: "text-green-400" };
  if (action.includes("deactivate.started")) return { label: "停用开始", color: "text-orange-400" };
  if (action.includes("deactivated") || action.includes("pack.deactivate"))
    return { label: "停用完成", color: "text-yellow-400" };
  if (action.includes("rollback.started")) return { label: "回滚开始", color: "text-purple-400" };
  if (action.includes("rollback.completed")) return { label: "回滚完成", color: "text-green-400" };
  if (action.includes("rollback.failed") || action.includes("回滚失败"))
    return { label: "回滚失败", color: "text-red-400" };
  if (action.includes("uninstall.started")) return { label: "卸载开始", color: "text-orange-400" };
  if (action.includes("uninstalled")) return { label: "卸载完成", color: "text-muted-foreground" };
  if (action.includes("capability.registered")) return { label: "能力注册", color: "text-blue-300" };
  if (action.includes("capability.deprecated")) return { label: "能力废弃", color: "text-muted-foreground" };
  if (action.includes("capability.reactivated")) return { label: "能力恢复", color: "text-green-300" };
  return { label: action, color: "text-muted-foreground" };
}

// ============================================================
// 子组件
// ============================================================

/** 状态徽章 */
function StatusBadge({ status }: { status: PackInstallation["status"] }) {
  const map: Record<
    PackInstallation["status"],
    { label: string; className: string; icon: React.ReactNode }
  > = {
    installing: {
      label: "安装中",
      className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      icon: <Loader2 className="size-3 animate-spin" />,
    },
    installed: {
      label: "已安装",
      className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      icon: <CheckCircle2 className="size-3" />,
    },
    uninstalling: {
      label: "卸载中",
      className: "bg-orange-500/10 text-orange-500 border-orange-500/20",
      icon: <Loader2 className="size-3 animate-spin" />,
    },
    uninstalled: {
      label: "已卸载",
      className: "bg-muted/60 text-muted-foreground border-border",
      icon: <XCircle className="size-3" />,
    },
    failed: {
      label: "失败",
      className: "bg-red-500/10 text-red-500 border-red-500/20",
      icon: <AlertTriangle className="size-3" />,
    },
    deprecated: {
      label: "已弃用",
      className: "bg-muted/40 text-muted-foreground border-border",
      icon: <XCircle className="size-3" />,
    },
    paused: {
      label: "已停用",
      className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      icon: <XCircle className="size-3" />,
    },
  };
  const { label, className, icon } = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        className
      )}
    >
      {icon}
      {label}
    </span>
  );
}

/** 单个包的安装/回滚事件时间线 */
function PackTimeline({ packId }: { packId: string }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTimeline = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/audit?targetType=industry-pack&targetId=${encodeURIComponent(packId)}&limit=30`
      );
      if (!res.ok) return;
      const data = await res.json();
      setLogs((data?.logs || data?.data?.logs || []).slice(0, 30));
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [packId]);

  useEffect(() => {
    fetchTimeline();
    // 每 10 秒轮询一次
    const interval = setInterval(fetchTimeline, 10_000);
    return () => clearInterval(interval);
  }, [fetchTimeline]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="size-3 animate-spin" />
        加载事件时间线...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-xs text-hint py-2 flex items-center gap-1.5">
        <History className="size-3" />
        暂无安装事件记录
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
      {logs.map((log) => {
        const { label, color } = getActionLabel(log.action);
        return (
          <div
            key={log.id}
            className="flex items-start gap-2 text-[11px] py-1.5 border-b border-border/30 last:border-0"
          >
            {/* 状态指示 */}
            <span
              className={cn(
                "mt-0.5 size-1.5 rounded-full shrink-0",
                log.status === "success"
                  ? "bg-emerald-400"
                  : log.status === "failed"
                    ? "bg-red-400"
                    : "bg-yellow-400"
              )}
            />
            <span className={cn("font-medium shrink-0 min-w-[64px]", color)}>
              {label}
            </span>
            <span className="text-muted-foreground flex-1 line-clamp-1">
              {log.detail || "-"}
            </span>
            <span className="text-hint shrink-0 text-[10px]">
              {formatTime(log.createdAt)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 展开能力明细面板 */
function CapabilityPanel({ manifest, packId }: { manifest: any; packId: string }) {
  const agents = manifest?.agents || [];
  const capabilities = manifest?.capabilities || [];
  const skills = capabilities.filter((c: any) => c.type === "skill");
  const workflows = capabilities.filter((c: any) => c.type === "workflow");
  const connectors = capabilities.filter((c: any) => c.type === "connector");

  // 降级策略：如果 manifest 数据为空，从 SDK API 实时拉取
  const [sdkData, setSdkData] = useState<{
    workflows?: any[]
    agents?: any[]
    skills?: any[]
    connectors?: any[]
  } | null>(null)
  const needsFallback = capabilities.length === 0 && agents.length === 0

  useEffect(() => {
    if (!needsFallback || !packId) return
    let active = true
    fetch(`/api/industry-packs/${packId}/capabilities`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (active && data) setSdkData(data) })
      .catch(() => {})
    return () => { active = false }
  }, [needsFallback, packId])

  // 降级数据优先使用 SDK 实时结果
  const displayAgents = (agents.length > 0 ? agents : sdkData?.agents) || []
  const displaySkills = skills.length > 0
    ? skills
    : (sdkData?.skills || []).map((s: any) => ({ ...s, type: 'skill', displayName: s.name || s.title }))
  const displayWorkflows = workflows.length > 0
    ? workflows
    : (sdkData?.workflows || []).map((w: any) => ({ ...w, type: 'workflow', displayName: w.name || w.title }))
  const displayConnectors = connectors.length > 0
    ? connectors
    : (sdkData?.connectors || []).flat().map((c: any) => ({ ...c, type: 'connector', displayName: c.name || c.title }))

  return (
    <div className="border-t border-border/30 pt-3 mt-1 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
      {/* 数字员工模板 */}
      <div className="bg-card/50 border border-border/40 rounded-xl p-3 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80 border-b border-border/30 pb-1.5">
          <Sparkles className="size-3.5 text-purple-500" />
          <span>数字员工模板</span>
          <span className="ml-auto text-[10px] bg-purple-500/10 text-purple-500 px-1.5 py-0.2 rounded-full font-mono font-semibold">
            {displayAgents.length}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 max-h-[150px] overflow-y-auto pr-1">
          {displayAgents.length > 0 ? (
            displayAgents.map((agent: any) => (
              <div
                key={agent.id}
                className="flex flex-col gap-0.5 rounded-lg bg-accent/30 px-2.5 py-1.5 border border-border/20"
              >
                <span className="text-[11px] font-medium text-foreground">
                  {agent.name || agent.displayName}
                </span>
                <span className="text-[9px] text-muted-foreground leading-normal line-clamp-1">
                  {agent.role || agent.description}
                </span>
                <span className="text-[8px] text-hint font-mono">
                  {agent.id}
                </span>
              </div>
            ))
          ) : (
            <span className="text-[10px] text-hint py-2 text-center">暂无智能体</span>
          )}
        </div>
      </div>

      {/* 技能组件 */}
      <div className="bg-card/50 border border-border/40 rounded-xl p-3 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80 border-b border-border/30 pb-1.5">
          <Zap className="size-3.5 text-amber-500" />
          <span>技能组件</span>
          <span className="ml-auto text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.2 rounded-full font-mono font-semibold">
            {displaySkills.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto pr-1">
          {displaySkills.length > 0 ? (
            displaySkills.map((cap: any) => (
              <span
                key={cap.id}
                title={`${cap.id}@v${cap.version} — ${cap.description || ""}`}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500/5 border border-amber-500/10 text-[10px] text-amber-600 font-medium px-2 py-1"
              >
                <span>{cap.displayName || cap.id}</span>
                <span className="text-[8px] text-amber-400/70 font-mono">v{cap.version}</span>
              </span>
            ))
          ) : (
            <span className="text-[10px] text-hint py-2 w-full text-center">暂无技能</span>
          )}
        </div>
      </div>

      {/* 工作流模板 */}
      <div className="bg-card/50 border border-border/40 rounded-xl p-3 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80 border-b border-border/30 pb-1.5">
          <Boxes className="size-3.5 text-emerald-500" />
          <span>工作流模板</span>
          <span className="ml-auto text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.2 rounded-full font-mono font-semibold">
            {displayWorkflows.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto pr-1">
          {displayWorkflows.length > 0 ? (
            displayWorkflows.map((cap: any) => (
              <span
                key={cap.id}
                title={`${cap.id}@v${cap.version} — ${cap.description || ""}`}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-[10px] text-emerald-600 font-medium px-2 py-1"
              >
                <span>{cap.displayName || cap.id}</span>
                <span className="text-[8px] text-emerald-400/70 font-mono">v{cap.version}</span>
              </span>
            ))
          ) : (
            <span className="text-[10px] text-hint py-2 w-full text-center">暂无工作流</span>
          )}
        </div>
      </div>

      {/* 系统连接器 */}
      <div className="bg-card/50 border border-border/40 rounded-xl p-3 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80 border-b border-border/30 pb-1.5">
          <Package className="size-3.5 text-blue-500" />
          <span>系统连接器</span>
          <span className="ml-auto text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-0.2 rounded-full font-mono font-semibold">
            {displayConnectors.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto pr-1">
          {displayConnectors.length > 0 ? (
            displayConnectors.map((cap: any) => (
              <span
                key={cap.id}
                title={`${cap.id}@v${cap.version} — ${cap.description || ""}`}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-500/5 border border-blue-500/10 text-[10px] text-blue-600 font-medium px-2 py-1"
              >
                <span>{cap.displayName || cap.id}</span>
                <span className="text-[8px] text-blue-400/70 font-mono">v{cap.version}</span>
              </span>
            ))
          ) : (
            <span className="text-[10px] text-hint py-2 w-full text-center">暂无连接器</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Confirm Modal — 二次确认弹窗 */
function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border/80 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "size-10 rounded-full flex items-center justify-center shrink-0",
              danger ? "bg-red-500/10 text-red-500" : "bg-brand/10 text-brand"
            )}
          >
            {danger ? (
              <AlertTriangle className="size-5" />
            ) : (
              <Shield className="size-5" />
            )}
          </div>
          <h3 className="text-foreground font-bold text-base">{title}</h3>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">{message}</p>
        <div className="flex gap-3 mt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-accent transition-colors border border-border"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors",
              danger
                ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20"
                : "bg-brand hover:bg-brand/90 shadow-lg shadow-brand/20"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 行业包卡片（核心组件）
// ============================================================

function PackCard({
  available,
  installation,
  allInstallations,
  onInstall,
  onActivate,
  onDeactivate,
  onRollback,
  onUninstall,
  operating,
}: {
  available: AvailablePack;
  installation?: PackInstallation;
  allInstallations: PackInstallation[];
  onInstall: (packId: string) => void;
  onActivate: (packId: string) => void;
  onDeactivate: (packId: string) => void;
  onRollback: (packId: string) => void;
  onUninstall: (packId: string, version: string) => void;
  operating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(false);

  const isInstalled = installation?.status === "installed";
  const isPaused = installation?.status === "paused";
  const isFailed = installation?.status === "failed";
  const isDeprecated = installation?.status === "deprecated";
  const isTransitioning =
    installation?.status === "installing" || installation?.status === "uninstalling";

  // 能力计数
  let capCount = 0;
  try {
    capCount = JSON.parse(installation?.installedCapabilities || "[]").length;
  } catch {
    capCount = 0;
  }

  // 可用升级检测
  const hasUpgrade =
    isInstalled && compareVersion(installation!.packVersion, available.version) < 0;

  // 可回滚检测：存在历史 deprecated 版本或 paused 版本
  const hasRollbackTarget = allInstallations.some(
    (i) =>
      i.packId === available.packId &&
      i.id !== installation?.id &&
      (i.status === "deprecated" || i.status === "paused") &&
      i.packVersion !== installation?.packVersion
  );

  // 从 manifest 中提取 compatibleHermesApi（可能是 {min, max} 对象或字符串）
  const compatibleHermesApi =
    extractApiVersion(installation?.manifest?.compatibleHermesApi) ||
    available.compatibleHermesApi;

  return (
    <div
      className={cn(
        "bg-card border-border rounded-2xl border p-5 flex flex-col gap-4 transition-all duration-200",
        isInstalled && "border-emerald-500/20 ring-1 ring-emerald-500/10"
      )}
    >
      {/* 顶部：名称 + 版本 + 状态 + 兼容性 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">
            {available.targetIndustry === "foreign-trade" ? "🚢" : "📦"}
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-foreground font-semibold text-sm leading-tight">
                {available.packName}
              </h3>
              {installation && <StatusBadge status={installation.status} />}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
              <span className="font-mono">
                v{isInstalled ? installation?.packVersion : available.version}
              </span>
              <span className="text-hint">·</span>
              <span className="font-mono text-hint">{available.packId}</span>
              {isInstalled && installation?.installationId && (
                <>
                  <span className="text-hint">·</span>
                  <span
                    className="font-mono text-[9px] text-hint select-all"
                    title={`installationId: ${installation.installationId}`}
                  >
                    {installation.installationId.length > 16
                      ? `${installation.installationId.slice(0, 8)}…${installation.installationId.slice(-6)}`
                      : installation.installationId}
                  </span>
                </>
              )}
              {isInstalled && compatibleHermesApi && (
                <>
                  <span className="text-hint">·</span>
                  <span className="inline-flex items-center gap-1 text-[9px] bg-blue-500/5 border border-blue-500/10 rounded px-1.5 py-0.5 font-mono text-blue-500">
                    <Shield className="size-2.5" />
                    Hermes API {compatibleHermesApi}
                  </span>
                </>
              )}
              {hasUpgrade && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 border border-brand/20 px-1.5 py-0.5 text-[9px] font-medium text-brand animate-pulse">
                  <Sparkles className="size-2 shrink-0" />
                  可升级到 v{available.version}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 操作按钮组 */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {/* 升级 */}
          {hasUpgrade && (
            <button
              type="button"
              onClick={() => onInstall(available.packId)}
              disabled={operating || isTransitioning}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              <Sparkles className="size-3" />
              升级
            </button>
          )}

          {/* 启用（paused 时可见） */}
          {isPaused && (
            <button
              type="button"
              onClick={() => onActivate(available.packId)}
              disabled={operating || isTransitioning}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              <Zap className="size-3" />
              启用
            </button>
          )}

          {/* 停用（installed 时可见） */}
          {isInstalled && (
            <button
              type="button"
              onClick={() => onDeactivate(available.packId)}
              disabled={operating || isTransitioning}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-yellow-500 hover:bg-yellow-500/10 transition-colors disabled:opacity-50"
            >
              <XCircle className="size-3" />
              停用
            </button>
          )}

          {/* 回滚 */}
          {isInstalled && hasRollbackTarget && (
            <button
              type="button"
              onClick={() => onRollback(available.packId)}
              disabled={operating || isTransitioning}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-purple-500 hover:bg-purple-500/10 transition-colors disabled:opacity-50"
            >
              <ArrowLeftRight className="size-3" />
              回滚
            </button>
          )}

          {/* 卸载 */}
          {(isInstalled || isPaused) && (
            <button
              type="button"
              onClick={() => onUninstall(available.packId, installation!.packVersion)}
              disabled={operating || isTransitioning}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-3" />
              卸载
            </button>
          )}

          {/* 安装（未安装、失败、已卸载、已弃用时可见） */}
          {(!installation ||
            isFailed ||
            installation.status === "uninstalled" ||
            isDeprecated) && (
            <button
              type="button"
              onClick={() => onInstall(available.packId)}
              disabled={operating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              {operating ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Package className="size-3" />
              )}
              {isFailed ? "重试安装" : isDeprecated ? "重新安装" : "安装"}
            </button>
          )}

          {isTransitioning && (
            <Loader2 className="size-4 animate-spin text-blue-500" />
          )}
        </div>
      </div>

      {/* 描述 */}
      <p className="text-muted-foreground text-xs leading-relaxed">
        {available.description}
      </p>

      {/* 底部：能力统计 + 时间线 */}
      <div className="flex items-center justify-between border-t border-border/50 pt-3">
        <div className="flex items-center gap-4">
          {/* 智能体数 */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="size-3 text-purple-500" />
            <span>{available.agentCount} 智能体</span>
          </div>
          {/* 能力数 */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Boxes className="size-3" />
            <span>
              {isInstalled
                ? `${capCount} 项能力已注册`
                : `${available.capabilityCount} 项能力`}
            </span>
          </div>
          {/* 安装时间 */}
          {installation?.installedAt && (
            <span className="text-xs text-hint flex items-center gap-1">
              <Clock className="size-3" />
              {new Date(installation.installedAt).toLocaleDateString("zh-CN")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* 事件时间线按钮 */}
          {installation && (
            <button
              type="button"
              onClick={() => setTimelineExpanded(!timelineExpanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-purple-500 transition-colors"
            >
              <History className="size-3.5" />
              <span>事件时间线</span>
              <ChevronDown
                className={cn(
                  "size-3 transition-transform duration-200",
                  timelineExpanded && "rotate-180"
                )}
              />
            </button>
          )}

          {/* 展开能力明细 */}
          {isInstalled && installation?.manifest && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-brand transition-colors"
            >
              <span>{expanded ? "收起明细" : "能力明细"}</span>
              <ChevronDown
                className={cn(
                  "size-3 transition-transform duration-200",
                  expanded && "rotate-180"
                )}
              />
            </button>
          )}
        </div>
      </div>

      {/* 事件时间线面板 */}
      {timelineExpanded && (
        <div className="border-t border-border/30 pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80 mb-2">
            <History className="size-3.5 text-purple-500" />
            <span>安装 / 激活 / 回滚事件</span>
          </div>
          <PackTimeline packId={available.packId} />
        </div>
      )}

      {/* 能力明细面板 */}
      {expanded && isInstalled && installation?.manifest && (
        <CapabilityPanel manifest={installation.manifest} packId={available.packId} />
      )}

      {/* 错误消息 */}
      {isFailed && installation?.errorMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-500">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div>
            <span className="font-semibold">安装失败：</span>
            <span>{installation.errorMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 主页面组件
// ============================================================

export default function IndustryPacksPage() {
  const [available, setAvailable] = useState<AvailablePack[]>([]);
  const [installations, setInstallations] = useState<PackInstallation[]>([]);
  const [loading, setLoading] = useState(true);
  const [operatingPackId, setOperatingPackId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // 二次确认弹窗状态
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger: boolean;
    onConfirm: () => void;
  } | null>(null);

  // ============================================================
  // 数据拉取
  // ============================================================

  const fetchAll = useCallback(async () => {
    try {
      const [instRes, availRes] = await Promise.all([
        fetch("/api/industry-packs?pageSize=50"),
        fetch("/api/industry-packs/available"),
      ]);

      if (instRes.ok) {
        const data = await instRes.json();
        setInstallations(Array.isArray(data?.data?.packs) ? data.data.packs : []);
      }

      if (availRes.ok) {
        const data = await availRes.json();
        setAvailable(data?.data?.available || data?.available || []);
      }
    } catch (err) {
      console.error("[IndustryPacks] fetchAll error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ============================================================
  // Toast
  // ============================================================

  const showToast = (type: "success" | "error" | "info", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  // ============================================================
  // 操作处理
  // ============================================================

  const handleInstall = async (packId: string) => {
    setConfirmModal({
      title: "确认安装",
      message: `即将安装「${packId}」行业包。此操作需 L3 授权，安装后将注册所有能力组件（智能体、技能、工作流、连接器）并写入审计日志。确认继续？`,
      confirmLabel: "确认安装",
      danger: false,
      onConfirm: async () => {
        setConfirmModal(null);
        setOperatingPackId(packId);
        try {
          const res = await fetch("/api/industry-packs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ packId, confirm: true }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "安装失败");
          showToast("success", `行业包 ${packId} 安装成功，能力组件已注册`);
          await fetchAll();
        } catch (err: unknown) {
          showToast(
            "error",
            `安装失败：${err instanceof Error ? err.message : "未知错误"}`
          );
        } finally {
          setOperatingPackId(null);
        }
      },
    });
  };

  const handleActivate = async (packId: string) => {
    setOperatingPackId(packId);
    try {
      const res = await fetch(`/api/industry-packs/${packId}/activate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "激活失败");
      showToast("success", `行业包 ${packId} 已启用`);
      await fetchAll();
    } catch (err: unknown) {
      showToast(
        "error",
        `激活失败：${err instanceof Error ? err.message : "未知错误"}`
      );
    } finally {
      setOperatingPackId(null);
    }
  };

  const handleDeactivate = async (packId: string) => {
    setConfirmModal({
      title: "确认停用",
      message: `确认停用「${packId}」行业包？系统将软下线其所有能力组件。能力注册表将标记为 deprecated，不会物理删除数据。`,
      confirmLabel: "确认停用",
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setOperatingPackId(packId);
        try {
          const res = await fetch(`/api/industry-packs/${packId}/deactivate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirm: true }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "停用失败");
          showToast("success", `行业包 ${packId} 已停用，能力组件已软下线`);
          await fetchAll();
        } catch (err: unknown) {
          showToast(
            "error",
            `停用失败：${err instanceof Error ? err.message : "未知错误"}`
          );
        } finally {
          setOperatingPackId(null);
        }
      },
    });
  };

  const handleRollback = async (packId: string) => {
    const currentInst = installations.find(
      (i) => i.packId === packId && i.status === "installed"
    );
    const targetInst = installations.find(
      (i) =>
        i.packId === packId &&
        i.id !== currentInst?.id &&
        (i.status === "deprecated" || i.status === "paused")
    );

    const fromVer = currentInst?.packVersion || "?";
    const toVer = targetInst?.packVersion || "?";

    setConfirmModal({
      title: "⚠️ 确认回滚",
      message: `即将回滚「${packId}」行业包：v${fromVer} → v${toVer}。\n\n该操作将：\n• 废弃当前版本 (v${fromVer}) 的所有已注册能力\n• 恢复上一版本 (v${toVer}) 的全部能力与智能体\n• 写入高危审计日志\n\n此操作为 HIGH risk，需要 confirmationToken 确认。`,
      confirmLabel: `确认回滚到 v${toVer}`,
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setOperatingPackId(packId);
        try {
          const res = await fetch(`/api/industry-packs/${packId}/rollback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              confirmationToken: "CONFIRM_INDUSTRY_ROLLBACK",
              targetVersion: targetInst?.packVersion || undefined,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "回滚失败");
          showToast(
            "success",
            `回滚完成：v${data.rolledBackFrom} → v${data.rolledBackTo}`
          );
          await fetchAll();
        } catch (err: unknown) {
          showToast(
            "error",
            `回滚失败：${err instanceof Error ? err.message : "未知错误"}`
          );
        } finally {
          setOperatingPackId(null);
        }
      },
    });
  };

  const handleUninstall = async (packId: string, version: string) => {
    setConfirmModal({
      title: "确认卸载",
      message: `确认卸载「${packId}」v${version}？系统将以 Graceful Deprecation 方式废弃所有已注册能力，不会物理删除数据。`,
      confirmLabel: "确认卸载",
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setOperatingPackId(packId);
        try {
          const res = await fetch(`/api/industry-packs/${packId}/${version}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "卸载失败");
          showToast("success", `行业包 ${packId} 已卸载`);
          await fetchAll();
        } catch (err: unknown) {
          showToast(
            "error",
            `卸载失败：${err instanceof Error ? err.message : "未知错误"}`
          );
        } finally {
          setOperatingPackId(null);
        }
      },
    });
  };

  // ============================================================
  // 多 pack 激活警告
  // ============================================================

  const activeIndustryPacks = installations.filter((i) => {
    if (i.status !== "installed") return false;
    const targetInd =
      (i.manifest as any)?.targetIndustry || (i.manifest as any)?.industry;
    return targetInd && targetInd !== "general";
  });

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <PageTransition>
      <div className="p-6 max-w-7xl mx-auto space-y-6 pb-12">
        <PageHeader
          title="行业包"
          description="安装、激活与回滚 Industry Pack。每个行业包包含数字员工、技能组件、工作流模板与系统连接器，安装后自动注册到能力注册表。"
          actions={
            <button
              type="button"
              onClick={fetchAll}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              刷新
            </button>
          }
        />

        {/* 多 pack 同时激活警告 */}
        {activeIndustryPacks.length > 1 && (
          <div className="w-full p-4 border border-red-500/20 bg-red-500/5 rounded-2xl flex items-center gap-2.5 text-sm text-red-500">
            <AlertTriangle className="size-5 shrink-0" />
            <div>
              <span className="font-semibold">系统警告：</span>
              检测到同时激活了 {activeIndustryPacks.length} 个行业包（
              {activeIndustryPacks.map((p) => p.packId).join("、")}
              ），可能导致智能体职责冲突。建议停用无关行业包以防止数据交叉污染。
            </div>
          </div>
        )}

        {/* Toast 通知 */}
        {toast && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 duration-200",
              toast.type === "success" &&
                "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
              toast.type === "error" &&
                "border-red-500/20 bg-red-500/5 text-red-500",
              toast.type === "info" &&
                "border-blue-500/20 bg-blue-500/5 text-blue-500"
            )}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : toast.type === "error" ? (
              <AlertTriangle className="size-4 shrink-0" />
            ) : (
              <Loader2 className="size-4 shrink-0 animate-spin" />
            )}
            {toast.message}
          </div>
        )}

        {/* 加载骨架 */}
        {loading ? (
          <div className="grid gap-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="bg-card border-border animate-pulse rounded-2xl border p-5 h-40"
              />
            ))}
          </div>
        ) : available.length === 0 && installations.length === 0 ? (
          <EmptyState
            icon={Package}
            title="尚未启用任何数字员工岗位包"
            description="当前工作空间尚未激活行业包。您可以点击右上角“刷新”重新扫描本地资产，或联系您的系统管理员部署行业包资源。"
          />
        ) : (
          <div className="space-y-4">
            {/* 分组标题 */}
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
              <ChevronRight className="size-3" />
              可用行业包
              <span className="text-hint ml-auto">{available.length || installations.filter(i => i.status === 'installed').length}</span>
            </div>

            <div className="grid gap-4">
              {/* 优先展示 available 列表（文件系统扫描结果），若为空则从安装记录反向派生 */}
              {(available.length > 0 ? available : installations
                .filter((i, idx, arr) => arr.findIndex(x => x.packId === i.packId) === idx)
                .map(i => ({
                  packId: i.packId,
                  packName: i.packName || i.packId,
                  version: i.packVersion,
                  description: (i.manifest as any)?.description || "",
                  targetIndustry: (i.manifest as any)?.targetIndustry || (i.manifest as any)?.industry || "general",
                  compatibleHermesApi: extractApiVersion((i.manifest as any)?.compatibleHermesApi) || "1.0.0",
                  compatibleRuntimeApi: extractApiVersion((i.manifest as any)?.compatibleRuntimeApi) || "1.0.0",
                  capabilityCount: JSON.parse(i.installedCapabilities || "[]").length,
                  agentCount: ((i.manifest as any)?.agents || []).length,
                })) as AvailablePack[]
              ).map((pack) => {
                // 取该 packId 下最新的 installed 或 paused 记录
                const relevantInstallations = installations
                  .filter((i) => i.packId === pack.packId)
                  .sort(
                    (a, b) =>
                      new Date(b.installedAt || b.createdAt).getTime() -
                      new Date(a.installedAt || a.createdAt).getTime()
                  );

                const activeInstallation = relevantInstallations.find(
                  (i) => i.status === "installed" || i.status === "paused"
                ) || relevantInstallations[0];

                return (
                  <PackCard
                    key={pack.packId}
                    available={pack}
                    installation={activeInstallation}
                    allInstallations={installations}
                    onInstall={handleInstall}
                    onActivate={handleActivate}
                    onDeactivate={handleDeactivate}
                    onRollback={handleRollback}
                    onUninstall={handleUninstall}
                    operating={operatingPackId === pack.packId}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* 二次确认弹窗 */}
        {confirmModal && (
          <ConfirmModal
            open={true}
            title={confirmModal.title}
            message={confirmModal.message}
            confirmLabel={confirmModal.confirmLabel}
            danger={confirmModal.danger}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(null)}
          />
        )}
      </div>
    </PageTransition>
  );
}
