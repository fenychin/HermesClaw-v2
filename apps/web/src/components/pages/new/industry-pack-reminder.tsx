"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Package, ArrowRight, X } from "lucide-react";

/**
 * 行业包未安装提醒 Banner
 * —— 在「新对话」页面顶部展示，引导用户安装行业包以解锁行业专属能力。
 * 仅当数据库中无任何 installed 状态的包时显示。
 */
export function IndustryPackReminder() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;

    let cancelled = false;
    fetch("/api/industry-packs?status=installed&pageSize=1")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const packs = data?.data?.packs || [];
        // 没有任何已安装的包 → 展示提醒
        if (packs.length === 0) setVisible(true);
      })
      .catch(() => {
        // API 不可用时静默隐藏
      });

    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  if (!visible) return null;

  return (
    <div className="mx-4 md:mx-8 mt-3 mb-1">
      <div className="max-w-2xl mx-auto flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
        <Package className="size-5 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-amber-500">尚未安装行业包</span>
          <span className="text-muted-foreground ml-2">
            安装后可获得外贸/行业专属数字员工、技能组件、工作流模板与系统连接器，提升业务处理效率。
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/industry-packs")}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition-colors"
        >
          前往安装
          <ArrowRight className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
