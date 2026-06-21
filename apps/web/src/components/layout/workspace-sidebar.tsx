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
import { cn } from "@/lib/utils";
import { prewarmWorkspaceRoute } from "@/lib/workspace-route-prewarm";
import { useWorkspaceMode } from "@/app/workspace/layout";

export function WorkspaceSidebar() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const mobileSidebarOpen = useUiStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);

  const { mode, setMode } = useWorkspaceMode();
  const { points, subscriptionPoints, plan } = useUser();

  const totalPointsLimit = subscriptionPoints + 100;
  const progressPercent = Math.min(100, Math.round((points / totalPointsLimit) * 100));

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileSidebarOpen(false);
    }
  }, [isMobile, setMobileSidebarOpen]);

  const pathname = usePathname();

  // 根据 mode 状态和 pathname 决定当前激活的项
  const activeSet = useMemo(() => {
    const set = new Set<string>();
    [...mainNav, ...bottomNav].forEach((item) => {
      if (item.href === "/workspace/chat") {
        if (mode === "session") set.add(item.href);
      } else if (item.href === "/workspace/agents") {
        if (mode === "config") set.add(item.href);
      } else {
        if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
          set.add(item.href);
        }
      }
    });
    return set;
  }, [pathname, mode]);

  const isActive = useCallback(
    (href: string) => activeSet.has(href),
    [activeSet],
  );

  const handleNavClick = (href: string) => {
    if (href === "/workspace/chat") {
      setMode("session");
    } else if (href === "/workspace/agents") {
      setMode("config");
    }
    if (isMobile) {
      setMobileSidebarOpen(false);
    }
  };

  const showContentDesktop = !isMobile;

  const sidebarContent = (
    <div className={cn("bg-sidebar border-sidebar-border flex h-full flex-col border-r overflow-hidden")}>
      {/* 品牌与折叠区 */}
      <div className={cn("flex h-14 items-center px-4 transition-all duration-150 shrink-0", sidebarCollapsed ? "justify-center" : "justify-between")}>
        <Link
          href={siteConfig.defaultRoute}
          onPointerEnter={() => prewarmWorkspaceRoute(siteConfig.defaultRoute)}
          onFocus={() => prewarmWorkspaceRoute(siteConfig.defaultRoute)}
          className={cn("text-foreground font-semibold text-sm whitespace-nowrap transition-all duration-150", sidebarCollapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100 w-auto")}
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
            {sidebarCollapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
          </button>
        )}
      </div>

      {/* 主导航 */}
      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-2">
        {mainNav.map((item) => {
          if (item.href === "/recent") {
            return (
              <SidebarRecent
                key={item.href}
                collapsed={sidebarCollapsed}
                isActive={isActive(item.href)}
              />
            );
          }
          return (
            <div key={item.href} onClick={() => handleNavClick(item.href)}>
              <SidebarNavItem
                item={item}
                collapsed={sidebarCollapsed}
                isActive={isActive(item.href)}
              />
            </div>
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
            <div key={rewardsItem.href} onClick={() => handleNavClick(rewardsItem.href)}>
              <SidebarNavItem
                item={rewardsItem}
                collapsed={sidebarCollapsed}
                isActive={isActive(rewardsItem.href)}
              />
            </div>
          );
        })()}

        {/* 2. 升级套餐卡片 */}
        {!sidebarCollapsed ? (
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-3 my-2 mx-1 select-none">
            <div className="flex justify-between items-center text-xs font-semibold mb-2">
              <span className="flex items-center gap-1 text-[#F5F5F5]">
                <Sparkles className="size-3.5 text-[#6D5EF9] fill-[#6D5EF9]" />
                {plan === "pro" ? "专业套餐" : plan === "enterprise" ? "企业套餐" : "免费套餐"}
              </span>
              <span className="text-[#B3B3B3]">
                <strong className="text-[#F5F5F5] font-bold">{points}</strong> 积分
              </span>
            </div>
            <div className="w-full h-1 bg-[#262626] rounded-full overflow-hidden mb-3">
              <div 
                className="h-full bg-[#6D5EF9] rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <Link
              href="/billing/plans"
              className="w-full h-9 bg-[#1F1F1F] text-[#F5F5F5] border border-[#262626] hover:bg-[#2A2A2A] hover:border-[#333333] transition-all rounded-[10px] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowUpCircle className="size-4 text-[#6D5EF9]" />
              <span>升级套餐</span>
            </Link>
          </div>
        ) : (
          <SidebarNavItem
            item={{
              href: "/billing/plans",
              label: "升级套餐",
              icon: ArrowUpCircle,
              description: "升级您的套餐计划"
            }}
            collapsed={true}
            isActive={isActive("/billing/plans")}
          />
        )}

        {/* 3. ⚙️ 设置 */}
        {(() => {
          const settingsItem = bottomNav.find((item) => item.href === "/settings");
          if (!settingsItem) return null;
          return (
            <div key={settingsItem.href} onClick={() => handleNavClick(settingsItem.href)}>
              <SidebarNavItem
                item={settingsItem}
                collapsed={sidebarCollapsed}
                isActive={isActive(settingsItem.href)}
              />
            </div>
          );
        })()}
      </div>
    </div>
  );

  return (
    <>
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

      {isMobile && (
        <AnimatePresence>
          {mobileSidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-black/50 fixed inset-0 z-40"
                onClick={() => setMobileSidebarOpen(false)}
              />
              <motion.aside
                initial={{ x: -220 }}
                animate={{ x: 0 }}
                exit={{ x: -220 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="fixed left-0 top-0 z-50 h-full w-[220px]"
              >
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
