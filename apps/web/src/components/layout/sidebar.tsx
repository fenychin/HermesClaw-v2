"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, X, ArrowUpCircle, Sparkles } from "lucide-react";
import { mainNav, bottomNav } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { useUiStore } from "@/stores/ui-store";
import { useUser } from "@/hooks/use-user";
import { SidebarNavItem } from "./sidebar-nav-item";
import { SidebarRecent } from "./sidebar-recent";
import { SidebarBrain } from "./sidebar-brain";
import { SidebarKnowledge } from "./sidebar-knowledge";
import { cn } from "@/lib/utils";
import { prewarmWorkspaceRoute } from "@/lib/workspace-route-prewarm";
import { AccountMenu } from "./AccountMenu";

/** 左侧固定侧边栏：品牌区 + 主导航 + 可展开最近 + 左下角固定设置 */
export function Sidebar() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const mobileSidebarOpen = useUiStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);

  // Zustand 全局状态 —— 使用精准 selector，避免用户 store 任意字段变更触发整栏重渲染
  const points = useUser((s) => s.points);
  const subscriptionPoints = useUser((s) => s.subscriptionPoints);
  const plan = useUser((s) => s.plan);

  // 积分计算进度百分比 (最高 100%)
  const totalPointsLimit = subscriptionPoints + 100;
  const progressPercent = Math.min(100, Math.round((points / totalPointsLimit) * 100));

  /** 响应式检测：< 1024px 为移动端 */
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  /** 移动端关闭侧边栏后自动关闭 overlay */
  useEffect(() => {
    if (!isMobile) {
      setMobileSidebarOpen(false);
    }
  }, [isMobile, setMobileSidebarOpen]);

  // ---- 提升 usePathname 到父组件，减少子组件 context 订阅 re-render ----
  const pathname = usePathname();

  // ✅ pathname 变化时一次性计算所有激活项，O(N) 而非每个 item 单独判断
  const activeSet = useMemo(() => {
    const set = new Set<string>();
    [...mainNav, ...bottomNav].forEach((item) => {
      if (item.href === "/workspace/chat") {
        if (pathname.startsWith("/workspace/") && !pathname.startsWith("/workspace/agents")) {
          set.add(item.href);
        }
      } else if (item.href === "/brain/memory") {
        if (
          pathname.startsWith("/brain/") ||
          pathname.startsWith("/workspace/agents") ||
          pathname.startsWith("/knowledge") ||
          pathname.startsWith("/settings/industry-packs") ||
          pathname.startsWith("/industry-packs")
        ) {
          set.add(item.href);
        }
      } else if (item.href === "/files") {
        if (pathname === "/files" || pathname.startsWith("/files/") || pathname.startsWith("/knowledge/")) {
          set.add(item.href);
        }
      } else if (item.href === "/settings") {
        if (pathname.startsWith("/settings") && !pathname.startsWith("/settings/industry-packs")) {
          set.add(item.href);
        }
      } else if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        set.add(item.href);
      }
    });
    return set;
  }, [pathname]);

  // ✅ 稳定引用：activeSet 不变时 isActive 引用不变
  // → SidebarNavItem 收到相同 boolean 时 memo 浅比较通过，跳过重渲染
  const isActive = useCallback(
    (href: string) => activeSet.has(href),
    [activeSet],
  );

  // ---- 桌面端始终可见 ----
  const showContentDesktop = !isMobile;

  /** 侧边栏内容 */
  const sidebarContent = (
    <div
      className={cn(
        "bg-sidebar border-sidebar-border flex h-full flex-col border-r",
        "overflow-hidden",
      )}
    >
      {/* 品牌与折叠区 */}
      <div
        className={cn(
          "flex h-14 items-center px-4 transition-all duration-150 shrink-0",
          sidebarCollapsed ? "justify-center" : "justify-between"
        )}
      >
        <Link
          href={siteConfig.defaultRoute}
          onPointerEnter={() => prewarmWorkspaceRoute(siteConfig.defaultRoute)}
          onFocus={() => prewarmWorkspaceRoute(siteConfig.defaultRoute)}
          className={cn(
            "text-foreground font-semibold text-sm whitespace-nowrap transition-all duration-150",
            sidebarCollapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100 w-auto"
          )}
          onClick={() => isMobile && setMobileSidebarOpen(false)}
        >
          {siteConfig.name}
        </Link>
        {!isMobile && (
          <button
            type="button"
            onClick={toggleSidebar}
            className="text-muted-foreground hover:text-foreground flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-accent/50"
            aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="size-[18px]" />
            ) : (
              <PanelLeftClose className="size-[18px]" />
            )}
          </button>
        )}
      </div>

      {/* 主导航 */}
      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-2">
        {mainNav.map((item) => {
          // "最近"使用可展开面板（SidebarRecent），其余用标准导航项
          if (item.href === "/recent") {
            return (
              <SidebarRecent
                key={item.href}
                collapsed={sidebarCollapsed}
                isActive={isActive(item.href)}
              />
            );
          }
          // "智慧大脑"使用下拉折叠面板（SidebarBrain）
          if (item.href === "/brain/memory") {
            return (
              <SidebarBrain
                key={item.href}
                collapsed={sidebarCollapsed}
                isActive={isActive(item.href)}
              />
            );
          }
          // "资料库"使用下拉折叠面板（SidebarKnowledge）
          if (item.href === "/files") {
            return (
              <SidebarKnowledge
                key={item.href}
                collapsed={sidebarCollapsed}
                isActive={isActive(item.href)}
              />
            );
          }
          return (
            <SidebarNavItem
              key={item.href}
              item={item}
              collapsed={sidebarCollapsed}
              isActive={isActive(item.href)}
            />
          );
        })}
      </nav>

      {/* 左下角固定设置 */}
      <div className="mt-auto space-y-1 px-3 py-3 shrink-0">
        {/* 1. 推荐奖励 */}
        {(() => {
          const rewardsItem = bottomNav.find((item) => item.href === "/rewards");
          if (!rewardsItem) return null;
          return (
            <SidebarNavItem
              key={rewardsItem.href}
              item={rewardsItem}
              collapsed={sidebarCollapsed}
              isActive={isActive(rewardsItem.href)}
            />
          );
        })()}

        {/* 2. 账号菜单向上展开 (替代原有的设置与升级套餐卡片，避免功能重复) */}
        <div className={cn("pt-2", sidebarCollapsed ? "px-0" : "px-1")}>
          <AccountMenu side="top" align="start" collapsed={sidebarCollapsed} />
        </div>
      </div>
    </div>
  );

  // ---- 渲染逻辑 ----
  return (
    <>
      {/* ========== 桌面端：固定宽度侧边栏（带动画） ========== */}
      {showContentDesktop && (
        <motion.aside
          initial={false}
          animate={{ width: sidebarCollapsed ? 60 : 220 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="hidden h-full shrink-0 lg:block"
          style={{ overflow: "hidden" }}
        >
          {sidebarContent}
        </motion.aside>
      )}

      {/* ========== 移动端：overlay 模式 ========== */}
      {isMobile && (
        <AnimatePresence>
          {mobileSidebarOpen && (
            <>
              {/* 遮罩 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-black/50 fixed inset-0 z-40"
                onClick={() => setMobileSidebarOpen(false)}
              />

              {/* 侧边栏面板 */}
              <motion.aside
                initial={{ x: -220 }}
                animate={{ x: 0 }}
                exit={{ x: -220 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="fixed left-0 top-0 z-50 h-full w-[220px]"
              >
                {/* 移动端关闲按钮 */}
                <div className="absolute right-3 top-3 z-10">
                  <button
                    type="button"
                    onClick={() => setMobileSidebarOpen(false)}
                    className="hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground flex size-7 items-center justify-center rounded-full transition-colors"
                    aria-label="关闭侧边栏"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                {sidebarContent}
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      )}
    </>
  );
}
