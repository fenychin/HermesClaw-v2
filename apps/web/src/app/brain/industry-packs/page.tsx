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
  status: "installing" | "installed" | "uninstalling" | "uninstalled" | "failed";
  installedCapabilities: string; // JSON string
  errorMessage?: string | null;
  installedAt?: string | null;
  uninstalledAt?: string | null;
}

/** 已知可用行业包清单（从 SDK 静态列表读取，后续可改为 API） */
const AVAILABLE_PACKS = [
  {
    packId: "foreign-trade",
    packName: "外贸行业包",
    description: "外贸专属数字员工操作系统，含询盘分级、客户开发、报价、跟进等工作流",
    version: "1.0.0",
    capabilityCount: 9,
    icon: "🚢",
  },
];

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
  onUninstall,
  operating,
}: {
  pack: (typeof AVAILABLE_PACKS)[number];
  installation?: PackInstallation;
  onInstall: (packId: string) => void;
  onActivate: (packId: string) => void;
  onUninstall: (packId: string, version: string) => void;
  operating: boolean;
}) {
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
            <span className="text-muted-foreground text-[10px] font-mono mt-0.5 block">
              v{pack.version} · {pack.packId}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* 激活按钮（已安装时可见） */}
          {isInstalled && (
            <button
              type="button"
              onClick={() => onActivate(pack.packId)}
              disabled={operating || isTransitioning}
              title="重新激活（热重载配置）"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/20 transition-colors disabled:opacity-50"
            >
              <Zap className="size-3" />
              激活
            </button>
          )}

          {/* 卸载按钮（已安装时可见） */}
          {isInstalled && (
            <button
              type="button"
              onClick={() => onUninstall(pack.packId, pack.version)}
              disabled={operating || isTransitioning}
              title="卸载行业包（仅废弃，不物理删除）"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-danger/10 hover:text-danger transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-3" />
              卸载
            </button>
          )}

          {/* 安装按钮（未安装或失败时可见） */}
          {(!installation || installation.status === "failed" || installation.status === "uninstalled") && (
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
              {installation?.status === "failed" ? "重试安装" : "安装"}
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

      {/* 能力统计 */}
      <div className="flex items-center gap-4 border-t border-border/50 pt-3">
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
      showToast("success", `行业包 ${packId} 已重新激活`);
    } catch (err: unknown) {
      showToast(
        "error",
        `激活失败：${err instanceof Error ? err.message : "未知错误"}`
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
      <div className="space-y-6">
        <PageHeader
          title="行业包管理"
          description="安装、激活与卸载 Industry Pack，每个行业包包含能力组件、工作流模板与连接器映射"
          action={
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
                    onUninstall={handleUninstall}
                    operating={operatingPackId === pack.packId}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
