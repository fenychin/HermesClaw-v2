"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Package, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivePack {
  packId: string;
  packName: string;
  packVersion: string;
  targetIndustry: string;
}

/**
 * 当前激活的行业包徽章
 * —— 在「新对话」输入框右上角展示，提醒用户当前正在使用行业专属上下文。
 */
export function IndustryPackBadge() {
  const router = useRouter();
  const [activePack, setActivePack] = useState<ActivePack | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/industry-packs?status=installed&pageSize=10")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const packs: any[] = data?.data?.packs || [];
        const installed = packs.filter((p: any) => p.status === "installed");

        if (installed.length === 0) {
          setActivePack(null);
          return;
        }

        // 取第一个已安装的行业包（通常只有一个）
        const pack = installed[0];
        const manifest = pack.manifest || {};
        setActivePack({
          packId: pack.packId,
          packName: pack.packName || manifest.name || pack.packId,
          packVersion: pack.packVersion,
          targetIndustry:
            manifest.targetIndustry || manifest.industry || "general",
        });
      })
      .catch(() => {
        // 静默失败
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!activePack) return null;

  const industryEmoji =
    activePack.targetIndustry === "foreign-trade"
      ? "🚢"
      : activePack.targetIndustry === "industry-intelligence"
        ? "📡"
        : "📦";

  return (
    <button
      type="button"
      onClick={() => router.push("/industry-packs")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
        "bg-emerald-500/5 border-emerald-500/20 text-emerald-600",
        "hover:bg-emerald-500/10 transition-colors cursor-pointer",
        "select-none"
      )}
      title={`当前行业上下文：${activePack.packName} v${activePack.packVersion}`}
    >
      <span className="text-sm leading-none">{industryEmoji}</span>
      <span className="font-semibold max-w-[120px] truncate">
        {activePack.packName}
      </span>
      <span className="text-[9px] text-emerald-500/60 font-mono">
        v{activePack.packVersion}
      </span>
      <ChevronRight className="size-3 text-emerald-500/40" />
    </button>
  );
}
