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
  Boxes,
  Zap,
  Trash2,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { PageTransition } from "@/components/common/PageTransition";
import { cn } from "@/lib/utils";

/** 安装记录类型（对应后端 IndustryPackInstallation） */
interface PackInstallation {
  id: string;
  packId: string;
  packName: string;
  packVersion: string;
  status: "installing" | "installed" | "uninstalling" | "uninstalled" | "failed" | "deprecated" | "paused"; // 对应后端新生命周期
  installedCapabilities: string; // JSON string
  errorMessage?: string | null;
  installedAt?: string | null;
  uninstalledAt?: string | null;
  manifest?: any;
}

/** 已知可用行业包清单（从 SDK 静态列表读取，后续可改为 API） */
const AVAILABLE_PACKS = [
  {
    packId: "foreign-trade",
    packName: "外贸行业包",
    description: "外贸专属数字员工操作系统，含询盘分级、客户开发、报价、跟进等工作流",
    version: "1.1.0",
    capabilityCount: 9,
    icon: "🚢",
  },
];

/** 版本号比较函数 (v1 < v2 返回 -1, v1 > v2 返回 1, 相等返回 0) */
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


/** 状态徽章 */
function StatusBadge({ status }: { status: PackInstallation["status"] }) {
  const map: Record<
    PackInstallation["status"],
    { label: string; className: string; icon: React.ReactNode }
  > = {
    installing: {
      label: "安装中",
      className: "bg-warning/10 text-warning border-warning/20",
      icon: <Loader2 className="size-3 animate-spin" />,
    },
    installed: {
      label: "已安装",
      className: "bg-success/10 text-success border-success/20",
      icon: <CheckCircle2 className="size-3" />,
    },
    uninstalling: {
      label: "卸载中",
      className: "bg-warning/10 text-warning border-warning/20",
      icon: <Loader2 className="size-3 animate-spin" />,
    },
    uninstalled: {
      label: "已卸载",
      className: "bg-muted/60 text-muted-foreground border-border",
      icon: <XCircle className="size-3" />,
    },
    failed: {
      label: "失败",
      className: "bg-danger/10 text-danger border-danger/20",
      icon: <AlertTriangle className="size-3" />,
    },
    deprecated: {
      label: "已弃用",
      className: "bg-muted/40 text-muted-foreground border-border",
      icon: <XCircle className="size-3" />,
    },
    paused: {
      label: "已停用",
      className: "bg-muted/50 text-muted-foreground border-border",
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

/** 行业包卡片 */
function PackCard({
  pack,
  installation,
  onInstall,
  onActivate,
  onDeactivate,
  onUninstall,
  operating,
}: {
  pack: (typeof AVAILABLE_PACKS)[number];
  installation?: PackInstallation;
  onInstall: (packId: string) => void;
  onActivate: (packId: string) => void;
  onDeactivate: (packId: string) => void;
  onUninstall: (packId: string, version: string) => void;
  operating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isInstalled = installation?.status === "installed";
  const isTransitioning =
    installation?.status === "installing" ||
    installation?.status === "uninstalling";

  let capCount = 0;
  try {
    capCount = JSON.parse(installation?.installedCapabilities || "[]").length;
  } catch {
    capCount = 0;
  }

  // 检测是否有可用升级：已安装，并且已安装的版本低于当前最新的可用版本
  const hasUpgrade =
    installation?.status === "installed" &&
    compareVersion(installation.packVersion, pack.version) < 0;

  return (
    <div
      className={cn(
        "bg-card border-border rounded-2xl border p-5 flex flex-col gap-4 transition-all duration-200",
        isInstalled && "border-brand/20 ring-1 ring-brand/10"
      )}
    >
      {/* 顶部：图标 + 名称 + 状态 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{pack.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-foreground font-semibold text-sm leading-tight">
                {pack.packName}
              </h3>
              {installation && <StatusBadge status={installation.status} />}
            </div>
            <span className="text-muted-foreground text-[10px] font-mono mt-0.5 flex items-center gap-1.5">
              v{installation?.status === "installed" ? installation.packVersion : pack.version} · {pack.packId}
              {hasUpgrade && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 border border-brand/20 px-1.5 py-0.5 text-[9px] font-medium text-brand animate-pulse">
                  <Sparkles className="size-2 shrink-0" />
                  可升级到 v{pack.version}
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* 升级按钮（有可用升级且已安装时可见） */}
          {hasUpgrade && (
            <button
              type="button"
              onClick={() => onInstall(pack.packId)}
              disabled={operating || isTransitioning}
              title={`安全升级到 v${pack.version}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              <Sparkles className="size-3" />
              升级
            </button>
          )}

          {/* 启用按钮（仅停用/暂停时可见） */}
          {installation?.status === "paused" && (
            <button
              type="button"
              onClick={() => onActivate(pack.packId)}
              disabled={operating || isTransitioning}
              title="开启并重新激活行业包能力组件"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              <Zap className="size-3" />
              启用
            </button>
          )}

          {/* 停用按钮（已安装时可见） */}
          {isInstalled && (
            <button
              type="button"
              onClick={() => onDeactivate(pack.packId)}
              disabled={operating || isTransitioning}
              title="暂停停用行业包以防止多开冲突"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-warning hover:bg-warning/10 transition-colors disabled:opacity-50"
            >
              <XCircle className="size-3" />
              停用
            </button>
          )}

          {/* 卸载按钮（已安装或已停用时可见） */}
          {(isInstalled || installation?.status === "paused") && (
            <button
              type="button"
              onClick={() => onUninstall(pack.packId, installation.packVersion)}
              disabled={operating || isTransitioning}
              title="卸载行业包（仅废弃，不物理删除）"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-danger/10 hover:text-danger transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-3" />
              卸载
            </button>
          )}

          {/* 安装按钮（未安装、失败、已卸载或已废弃时可见） */}
          {(!installation || 
            installation.status === "failed" || 
            installation.status === "uninstalled" || 
            installation.status === "deprecated") && (
            <button
              type="button"
              onClick={() => onInstall(pack.packId)}
              disabled={operating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              {operating ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Package className="size-3" />
              )}
              {installation?.status === "failed" 
                ? "重试安装" 
                : (installation?.status === "deprecated" ? "重新安装" : "安装")}
            </button>
          )}

          {/* 加载中指示 */}
          {isTransitioning && (
            <Loader2 className="size-4 animate-spin text-warning" />
          )}
        </div>
      </div>

      {/* 描述 */}
      <p className="text-muted-foreground text-xs leading-relaxed">
        {pack.description}
      </p>

      {/* 能力统计与折叠控制 */}
      <div className="flex items-center justify-between border-t border-border/50 pt-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Boxes className="size-3.5" />
            <span>
              {isInstalled
                ? `${capCount} 个能力已注册`
                : `${pack.capabilityCount} 个能力待注册`}
            </span>
          </div>
          {installation?.installedAt && (
            <span className="text-xs text-hint">
              安装于 {new Date(installation.installedAt).toLocaleDateString("zh-CN")}
            </span>
          )}
        </div>

        {isInstalled && installation?.manifest && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-brand transition-colors focus:outline-none"
          >
            <span>{expanded ? "收起明细" : "展开能力明细"}</span>
            <ChevronDown className={cn("size-3.5 transition-transform duration-200", expanded && "rotate-180")} />
          </button>
        )}
      </div>

      {/* 展开的明细面板 */}
      {expanded && isInstalled && installation?.manifest && (
        <div className="border-t border-border/30 pt-3 mt-1 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* 数字员工模板 */}
          <div className="bg-card/50 border border-border/40 rounded-xl p-3 flex flex-col gap-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.01)]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80 border-b border-border/30 pb-1.5">
              <Sparkles className="size-3.5 text-purple-500" />
              <span>数字员工模板</span>
              <span className="ml-auto text-[10px] bg-purple-500/10 text-purple-500 px-1.5 py-0.2 rounded-full font-mono font-semibold">
                {installation.manifest.agents?.length || 0}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 max-h-[150px] overflow-y-auto pr-1">
              {installation.manifest.agents && installation.manifest.agents.length > 0 ? (
                installation.manifest.agents.map((agent: any) => (
                  <div key={agent.id} className="flex flex-col gap-0.5 rounded-lg bg-accent/30 px-2.5 py-1.5 border border-border/20">
                    <span className="text-[11px] font-medium text-foreground">{agent.name || agent.displayName}</span>
                    <span className="text-[9px] text-muted-foreground leading-normal line-clamp-1">{agent.role || agent.description}</span>
                  </div>
                ))
              ) : (
                <span className="text-[10px] text-hint py-2 text-center">暂无智能体</span>
              )}
            </div>
          </div>

          {/* 技能组件 */}
          <div className="bg-card/50 border border-border/40 rounded-xl p-3 flex flex-col gap-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.01)]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80 border-b border-border/30 pb-1.5">
              <Zap className="size-3.5 text-amber-500" />
              <span>技能组件</span>
              <span className="ml-auto text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.2 rounded-full font-mono font-semibold">
                {installation.manifest.capabilities?.filter((c: any) => c.type === 'skill').length || 0}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto pr-1 align-content-start">
              {installation.manifest.capabilities?.filter((c: any) => c.type === 'skill').length > 0 ? (
                installation.manifest.capabilities
                  .filter((c: any) => c.type === 'skill')
                  .map((cap: any) => (
                    <span key={cap.id} title={cap.description} className="inline-flex items-center rounded-lg bg-amber-500/5 border border-amber-500/10 text-[10px] text-amber-600 font-medium px-2 py-1 select-none">
                      {cap.displayName || cap.id}
                    </span>
                  ))
              ) : (
                <span className="text-[10px] text-hint py-2 w-full text-center">暂无技能</span>
              )}
            </div>
          </div>

          {/* 工作流模板 */}
          <div className="bg-card/50 border border-border/40 rounded-xl p-3 flex flex-col gap-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.01)]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80 border-b border-border/30 pb-1.5">
              <Boxes className="size-3.5 text-emerald-500" />
              <span>工作流模板</span>
              <span className="ml-auto text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.2 rounded-full font-mono font-semibold">
                {installation.manifest.capabilities?.filter((c: any) => c.type === 'workflow').length || 0}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto pr-1 align-content-start">
              {installation.manifest.capabilities?.filter((c: any) => c.type === 'workflow').length > 0 ? (
                installation.manifest.capabilities
                  .filter((c: any) => c.type === 'workflow')
                  .map((cap: any) => (
                    <span key={cap.id} title={cap.description} className="inline-flex items-center rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-[10px] text-emerald-600 font-medium px-2 py-1 select-none">
                      {cap.displayName || cap.id}
                    </span>
                  ))
              ) : (
                <span className="text-[10px] text-hint py-2 w-full text-center">暂无工作流</span>
              )}
            </div>
          </div>

          {/* 系统连接器 */}
          <div className="bg-card/50 border border-border/40 rounded-xl p-3 flex flex-col gap-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.01)]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80 border-b border-border/30 pb-1.5">
              <Package className="size-3.5 text-blue-500" />
              <span>系统连接器</span>
              <span className="ml-auto text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-0.2 rounded-full font-mono font-semibold">
                {installation.manifest.capabilities?.filter((c: any) => c.type === 'connector').length || 0}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto pr-1 align-content-start">
              {installation.manifest.capabilities?.filter((c: any) => c.type === 'connector').length > 0 ? (
                installation.manifest.capabilities
                  .filter((c: any) => c.type === 'connector')
                  .map((cap: any) => (
                    <span key={cap.id} title={cap.description} className="inline-flex items-center rounded-lg bg-blue-500/5 border border-blue-500/10 text-[10px] text-blue-600 font-medium px-2 py-1 select-none">
                      {cap.displayName || cap.id}
                    </span>
                  ))
              ) : (
                <span className="text-[10px] text-hint py-2 w-full text-center">暂无连接器</span>
              )}
            </div>
          </div>
        </div>
      )}


      {/* 错误消息 */}
      {installation?.status === "failed" && installation.errorMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{installation.errorMessage}</span>
        </div>
      )}
    </div>
  );
}

/** 行业包管理页主体 */
export default function IndustryPacksPage() {
  const [installations, setInstallations] = useState<PackInstallation[]>([]);
  const [loading, setLoading] = useState(true);
  const [operatingPackId, setOperatingPackId] = useState<string | null>(null);
  const [showReloadModal, setShowReloadModal] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  /** 拉取已安装列表 */
  const fetchInstallations = useCallback(async () => {
    try {
      const res = await fetch("/api/industry-packs?status=&pageSize=50");
      if (!res.ok) throw new Error("获取行业包列表失败");
      const data = await res.json();
      setInstallations(
        Array.isArray(data?.data?.packs) ? data.data.packs : []
      );
    } catch (err) {
      console.error("[IndustryPacks] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstallations();
  }, [fetchInstallations]);

  /** 显示 toast 提示 */
  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  /** 安装行业包 */
  const handleInstall = async (packId: string) => {
    const confirmed = confirm(
      `「${packId}」行业包安装需要 L3 授权，安装后将注册所有能力组件。确认继续？`
    );
    if (!confirmed) return;
    setOperatingPackId(packId);
    try {
      const res = await fetch("/api/industry-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "安装失败");
      showToast("success", `行业包 ${packId} 安装成功，已注册能力组件`);
      await fetchInstallations();
    } catch (err: unknown) {
      showToast(
        "error",
        `安装失败：${err instanceof Error ? err.message : "未知错误"}`
      );
    } finally {
      setOperatingPackId(null);
    }
  };

  /** 激活行业包 */
  const handleActivate = async (packId: string) => {
    setOperatingPackId(packId);
    try {
      const res = await fetch(`/api/industry-packs/${packId}/activate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "激活失败");
      showToast("success", `行业包 ${packId} 已成功启用`);
      await fetchInstallations();
    } catch (err: unknown) {
      showToast(
        "error",
        `激活失败：${err instanceof Error ? err.message : "未知错误"}`
      );
    } finally {
      setOperatingPackId(null);
    }
  };

  /** 停用/暂停行业包 */
  const handleDeactivate = async (packId: string) => {
    const confirmed = confirm(
      `确认暂停/停用「${packId}」行业包？系统将软下线其所有能力组件。`
    );
    if (!confirmed) return;
    setOperatingPackId(packId);
    try {
      const res = await fetch(`/api/industry-packs/${packId}/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "停用失败");
      showToast("success", `行业包 ${packId} 已暂停停用`);
      await fetchInstallations();
      setShowReloadModal(true); // 显示刷新清缓存引导框
    } catch (err: unknown) {
      showToast(
        "error",
        `停用失败：${err instanceof Error ? err.message : "未知错误"}`
      );
    } finally {
      setOperatingPackId(null);
    }
  };

  /** 卸载行业包 */
  const handleUninstall = async (packId: string, version: string) => {
    const confirmed = confirm(
      `确认卸载「${packId}」行业包？系统将以 Graceful Deprecation 方式废弃所有已注册能力，不会物理删除数据。`
    );
    if (!confirmed) return;
    setOperatingPackId(packId);
    try {
      const res = await fetch(`/api/industry-packs/${packId}/${version}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "卸载失败");
      showToast("success", `行业包 ${packId} 已通过 Graceful Deprecation 方式卸载`);
      await fetchInstallations();
    } catch (err: unknown) {
      showToast(
        "error",
        `卸载失败：${err instanceof Error ? err.message : "未知错误"}`
      );
    } finally {
      setOperatingPackId(null);
    }
  };

  return (
    <PageTransition>
      <div className="p-6 max-w-5xl mx-auto space-y-6 pb-12">
        <PageHeader
          title="行业包管理"
          description="安装、激活与卸载 Industry Pack，每个行业包包含能力组件、工作流模板与连接器映射"
          breadcrumb={[
            { label: "系统设置", href: "/settings" },
            { label: "行业包管理" },
          ]}
          actions={
            <button
              type="button"
              onClick={fetchInstallations}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              刷新
            </button>
          }
        />

        {/* 多个行业包同时激活的警告 Banner */}
        {installations.filter((i) => i.status === "installed").length > 1 && (
          <div className="w-full p-4 border border-danger/20 bg-danger/5 rounded-2xl flex items-center gap-2.5 text-sm text-danger animate-pulse select-none">
            <span>⚠️</span>
            <span className="font-semibold">
              系统警告：检测到您同时启用了多个行业包（如：外贸包等），这可能会导致智能员工的职责和执行决策产生混乱。请暂停停用无关的行业包以防止数据交叉污染！
            </span>
          </div>
        )}

        {/* Toast 通知 */}
        {toast && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm",
              toast.type === "success"
                ? "border-success/20 bg-success/10 text-success"
                : "border-danger/20 bg-danger/5 text-danger"
            )}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <AlertTriangle className="size-4 shrink-0" />
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
                className="bg-card border-border animate-pulse rounded-2xl border p-5 h-36"
              />
            ))}
          </div>
        ) : AVAILABLE_PACKS.length === 0 ? (
          <EmptyState
            icon={Package}
            title="暂无可用行业包"
            description="请联系管理员添加行业包资产"
          />
        ) : (
          <div className="space-y-4">
            {/* 分组标题 */}
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
              <ChevronRight className="size-3" />
              可用行业包
              <span className="text-hint ml-auto">{AVAILABLE_PACKS.length}</span>
            </div>

            <div className="grid gap-4">
              {AVAILABLE_PACKS.map((pack) => {
                const installation = installations
                  .filter((i) => i.packId === pack.packId)
                  .sort(
                    (a, b) =>
                      new Date(b.installedAt || 0).getTime() -
                      new Date(a.installedAt || 0).getTime()
                  )[0];

                return (
                  <PackCard
                    key={pack.packId}
                    pack={pack}
                    installation={installation}
                    onInstall={handleInstall}
                    onActivate={handleActivate}
                    onDeactivate={handleDeactivate}
                    onUninstall={handleUninstall}
                    operating={operatingPackId === pack.packId}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 玻璃拟态停用强制刷新缓存引导弹窗 */}
      {showReloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border/80 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl flex flex-col gap-4 text-center">
            <div className="size-12 rounded-full bg-warning/10 text-warning flex items-center justify-center mx-auto text-xl animate-bounce">
              ✨
            </div>
            <h3 className="text-foreground font-bold text-base">停用操作成功</h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              为了确保系统核心编编脑、记忆和能力缓存彻底清理，杜绝任何物理数据交叉感染的隐患，系统强烈建议您**立即刷新页面或重新登录**。
            </p>
            <div className="flex flex-col gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowReloadModal(false);
                  window.location.reload();
                }}
                className="w-full bg-brand py-2 rounded-xl text-xs font-semibold text-white hover:bg-brand/90 transition-colors shadow-lg shadow-brand/20 animate-pulse"
              >
                立即刷新网页
              </button>
              <button
                type="button"
                onClick={() => setShowReloadModal(false)}
                className="w-full py-2 rounded-xl text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                稍后手动处理
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
