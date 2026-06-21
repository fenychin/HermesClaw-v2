"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useUiStore } from "@/stores/ui-store";

// PERF: CommandPalette 和 UpgradeToast 懒加载 — 仅在用户触发 Cmd+K 或需要时加载
// 将 cmdk (~50KB gzip) 和 UpgradeToast 从 main-app.js 中拆分到独立 chunk
const CommandPalette = dynamic(
  () => import("@/components/layout/command-palette").then((m) => ({ default: m.CommandPalette })),
  { ssr: false }
);
const UpgradeToast = dynamic(
  () => import("@/components/common/upgrade-toast").then((m) => ({ default: m.UpgradeToast })),
  { ssr: false }
);

/**
 * 工作台全局交互层（客户端组件）
 * —— 注册键盘快捷键 + 挂载命令面板与升级提醒 Toast
 * —— 仅客户端挂载后渲染，避免 SSR hydration 不匹配
 * —— P4 优化：CommandPalette/UpgradeToast 懒加载，main-app.js 减小 ~60KB
 */
export function WorkspaceOverlays() {
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  /* 全局键盘监听：Cmd+K（Mac）/ Ctrl+K（Windows）打开命令面板 */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setCommandPaletteOpen]);

  // SSR 阶段不渲染任何内容，hydration 后再挂载
  if (!mounted) return null;

  return (
    <>
      <CommandPalette />
      <UpgradeToast />
    </>
  );
}
