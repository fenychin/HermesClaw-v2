"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useUiStore } from "@/stores/ui-store";

/**
 * 按需延迟加载的组件（减少首屏 JS ~592KB）
 * - CommandPalette：cmdk ~134KB + framer-motion ~16KB
 * - UpgradeToast：framer-motion ~16KB（共享 chunk）
 */
const CommandPalette = dynamic(
  () => import("@/components/layout/command-palette").then((m) => ({ default: m.CommandPalette })),
  { ssr: false },
);

const UpgradeToast = dynamic(
  () => import("@/components/common/upgrade-toast").then((m) => ({ default: m.UpgradeToast })),
  { ssr: false },
);

/**
 * 工作台全局交互层（客户端组件）
 * —— 注册键盘快捷键 + 挂载命令面板与升级提醒 Toast
 */
export function WorkspaceOverlays() {
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);

  /* 全局键盘监听：Cmd+K（Mac）/ Ctrl+K（Windows）打开命令面板 */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) 或 Ctrl+K (Windows)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setCommandPaletteOpen]);

  return (
    <>
      <CommandPalette />
      <UpgradeToast />
    </>
  );
}
