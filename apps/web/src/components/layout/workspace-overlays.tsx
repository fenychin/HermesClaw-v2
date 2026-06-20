"use client";

import { useEffect, useState } from "react";
import { useUiStore } from "@/stores/ui-store";
import { CommandPalette } from "@/components/layout/command-palette";
import { UpgradeToast } from "@/components/common/upgrade-toast";

/**
 * 工作台全局交互层（客户端组件）
 * —— 注册键盘快捷键 + 挂载命令面板与升级提醒 Toast
 * —— 仅客户端挂载后渲染，避免 SSR hydration 不匹配
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

  // SSR 阶段不渲染任何内容，hydration 后再挂载（此时无 DOM 差异）
  if (!mounted) return null;

  return (
    <>
      <CommandPalette />
      <UpgradeToast />
    </>
  );
}
