"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

// 版本对比函数
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

const LATEST_VERSIONS: Record<string, string> = {
  "foreign-trade": "1.1.0",
};

export function PackUpgradeModal() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [targetPack, setTargetPack] = useState<{
    id: string;
    name: string;
    currentVersion: string;
    latestVersion: string;
  } | null>(null);

  useEffect(() => {
    // 检查 localStorage，如果本版本已被忽略，则不再弹窗
    const dismissedVersion = localStorage.getItem("upgrade_dismissed_foreign-trade");
    if (dismissedVersion === LATEST_VERSIONS["foreign-trade"]) {
      return;
    }

    async function checkUpgrades() {
      try {
        const res = await fetch("/api/industry-packs?pageSize=50");
        if (!res.ok) return;
        const data = await res.json();
        const packs = Array.isArray(data?.data?.packs) ? data.data.packs : [];

        // 查找外贸行业包的已安装记录
        const activePack = packs.find(
          (p: any) => p.packId === "foreign-trade" && p.status === "installed"
        );

        if (activePack) {
          const latest = LATEST_VERSIONS["foreign-trade"];
          if (compareVersion(activePack.packVersion, latest) < 0) {
            setTargetPack({
              id: "foreign-trade",
              name: activePack.packName || "外贸行业包",
              currentVersion: activePack.packVersion,
              latestVersion: latest,
            });
            // 延迟一点弹出，以保证页面加载体验更平滑
            setTimeout(() => setIsOpen(true), 1500);
          }
        }
      } catch (err) {
        console.error("[UpgradeModal] check upgrade failed:", err);
      }
    }

    checkUpgrades();
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    if (targetPack) {
      // 记录在 localStorage，本次免打扰
      localStorage.setItem(`upgrade_dismissed_${targetPack.id}`, targetPack.latestVersion);
    }
  };

  const handleUpgradeRedirect = () => {
    setIsOpen(false);
    router.push("/settings/industry-packs");
  };

  if (!isOpen || !targetPack) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm transition-opacity duration-300">
      <div 
        className={cn(
          "relative w-full max-w-md overflow-hidden rounded-3xl border border-brand/20 bg-card p-6 shadow-2xl transition-all duration-300",
          "animate-in fade-in zoom-in-95"
        )}
      >
        {/* 顶部拟态渐变底纹 */}
        <div className="absolute -right-16 -top-16 size-36 rounded-full bg-brand/10 blur-2xl" />
        <div className="absolute -left-16 -bottom-16 size-36 rounded-full bg-purple-500/10 blur-2xl" />

        {/* 关闭按钮 */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <X className="size-4" />
        </button>

        {/* 内容布局 */}
        <div className="flex flex-col items-center text-center gap-4 mt-2">
          {/* 精美拟态图标环 */}
          <div className="relative flex size-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand to-purple-500 text-white shadow-lg shadow-brand/20">
            <Sparkles className="size-7 animate-bounce" />
            <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-success text-[10px] font-bold border-2 border-card text-white">
              v2
            </span>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-foreground tracking-tight">
              发现新版本可用
            </h3>
            <p className="text-xs text-muted-foreground">
              检测到您正在运行 {targetPack.name} v{targetPack.currentVersion}
            </p>
          </div>

          {/* 版本对比拟态卡片 */}
          <div className="flex items-center justify-center gap-6 rounded-2xl border border-border/60 bg-accent/30 w-full py-3 px-4 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
            <div className="text-center">
              <span className="text-[10px] text-hint block uppercase font-medium">当前版本</span>
              <span className="text-sm font-semibold text-muted-foreground font-mono">v{targetPack.currentVersion}</span>
            </div>
            <ArrowRight className="size-4 text-hint" />
            <div className="text-center">
              <span className="text-[10px] text-brand block uppercase font-semibold">最新版本</span>
              <span className="text-base font-bold text-brand font-mono animate-pulse">v{targetPack.latestVersion}</span>
            </div>
          </div>

          {/* 新版特性介绍 */}
          <div className="text-left w-full rounded-2xl border border-border/40 p-3.5 space-y-2 bg-card/50">
            <span className="text-[11px] font-bold text-foreground/80 flex items-center gap-1.5">
              🚢 升级特性概要：
            </span>
            <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc pl-4 leading-relaxed">
              <li>
                <strong className="text-foreground">能力全量升级</strong>：从原 9 个基础能力，升级并注册扩展为 21 个核心技能与连接器。
              </li>
              <li>
                <strong className="text-foreground">多语言开发信工作流</strong>：新增自进化型报价生成与客户画像提取二阶段开发信模板。
              </li>
              <li>
                <strong className="text-foreground">生命周期审计增强</strong>：升级过程满足 AGENTS.md 二阶段审计规范，保留旧版本弃用轨迹。
              </li>
            </ul>
          </div>

          {/* 操作按钮 */}
          <div className="flex w-full gap-3 mt-2">
            <button
              onClick={handleClose}
              className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-accent transition-colors"
            >
              稍后处理
            </button>
            <button
              onClick={handleUpgradeRedirect}
              className="flex-1 rounded-xl bg-gradient-to-r from-brand to-purple-600 px-4 py-2.5 text-xs font-semibold text-white hover:opacity-95 shadow-md shadow-brand/10 transition-opacity"
            >
              立即升级
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
