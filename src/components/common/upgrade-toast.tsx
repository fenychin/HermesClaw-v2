"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Zap, X } from "lucide-react";
import { useTradeStore } from "@/stores/trade-store";
import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/utils";

/** localStorage key：已关闭的提案 ID 集合（JSON 数组），非全局二进制 */
const DISMISSED_IDS_KEY = "hc_upgrade_toast_dismissed_ids";

/** 从 localStorage 读取已关闭的提案 ID 集合 */
function loadDismissedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_IDS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

/** 写入 localStorage */
function saveDismissedIds(ids: Set<string>) {
  try {
    localStorage.setItem(
      DISMISSED_IDS_KEY,
      JSON.stringify([...ids]),
    );
  } catch {
    // 存储不可用时静默忽略
  }
}

/**
 * Harness 升级提醒 Toast
 * —— 固定在右下角，从 trade-store 读取 pending 状态的提案。
 *    关闭后按提案 ID 记录，新提案出现时 Toast 自动重新弹出。
 */
export function UpgradeToast() {
  const router = useRouter();
  const mounted = useMounted();
  const harnessProposals = useTradeStore((s) => s.harnessProposals);

  const pendingIds = useMemo(
    () =>
      (harnessProposals || [])
        .filter((p) => p.status === "pending")
        .map((p) => p.id),
    [harnessProposals],
  );

  const pendingCount = pendingIds.length;

  /* 在 useState 初始化器中同步读取 localStorage */
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    loadDismissedIds,
  );

  /* 当前是否有未关闭的 pending 提案 */
  const hasNewProposals = pendingIds.some((id) => !dismissedIds.has(id));

  /* 仅在客户端挂载完成后展示，避免 SSR 水合不一致 */
  const visible = mounted && pendingCount > 0 && hasNewProposals;

  const handleClose = useCallback(() => {
    // 将当前所有 pending 提案 ID 加入关闭集合
    const updated = new Set(dismissedIds);
    for (const id of pendingIds) {
      updated.add(id);
    }
    setDismissedIds(updated);
    saveDismissedIds(updated);
  }, [dismissedIds, pendingIds]);

  const handleApprove = useCallback(() => {
    router.push("/settings");
    // 点击"立即审批"也关闭 toast
    handleClose();
  }, [router, handleClose]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{
            delay: 2,
            duration: 0.35,
            ease: "easeOut",
          }}
          className={cn(
            "fixed bottom-6 right-6 z-50 w-72",
            "rounded-card border border-brand-primary/30 bg-card p-5",
            "shadow-xl",
          )}
        >
          {/* 左侧紫色竖线 */}
          <div className="bg-brand-primary absolute inset-y-3 left-0 w-1 rounded-full" />

          {/* 内容区 */}
          <div className="pl-2">
            {/* 顶部：图标 + 标题 + 关闭按钮 */}
            <div className="flex items-center gap-2">
              <Zap className="text-brand-primary size-4 shrink-0" />
              <span className="text-foreground flex-1 text-sm font-semibold">
                Harness 升级建议
              </span>
              <button
                type="button"
                onClick={handleClose}
                className="text-muted-foreground hover:bg-accent -mr-1 rounded-md p-1 transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* 副标题：待审批数量 */}
            <p className="text-muted-foreground mt-1 text-sm">
              {pendingCount} 条提案待审批
            </p>

            {/* 立即审批按钮 */}
            <button
              type="button"
              onClick={handleApprove}
              className={cn(
                "bg-brand-primary text-primary-foreground mt-3 w-full rounded-lg px-3 py-1.5",
                "text-xs font-medium transition-colors hover:bg-brand-primary/80",
              )}
            >
              立即审批
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
