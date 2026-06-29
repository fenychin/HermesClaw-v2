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

  const displayName =
    activePack.packId === "foreign-trade"
      ? "外贸行业"
      : activePack.packName.replace(/包$/, "");

  return (
    <button
      type="button"
      onClick={() => router.push("/industry-packs")}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
        "bg-emerald-500/10 border-emerald-500/30 text-white",
        "hover:bg-emerald-500/15 hover:border-emerald-500/50 transition-colors cursor-pointer",
        "select-none"
      )}
      title={`当前行业上下文：${activePack.packName} v${activePack.packVersion}`}
    >
      <span className="font-semibold max-w-[120px] truncate">
        {displayName}
      </span>
      <ChevronRight className="size-3 text-white/40" />
    </button>
  );
}
