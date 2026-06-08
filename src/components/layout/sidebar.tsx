"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { mainNav, bottomNav } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { useUiStore } from "@/stores/ui-store";
import { SidebarNavItem } from "./sidebar-nav-item";
import { SidebarRecent } from "./sidebar-recent";
import { cn } from "@/lib/utils";

/** 除"最近"以外的主导航项 */
const topNavItems = mainNav.filter((item) => item.href !== "/recent");

/** 左侧固定侧边栏：品牌区 + 主导航 + 可展开最近 + 左下角固定设置 */
export function Sidebar() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const mobileSidebarOpen = useUiStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);

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
      {/* 品牌区 */}
      <Link
        href={siteConfig.defaultRoute}
        className="hover:bg-sidebar-accent flex h-16 items-center gap-2 px-3 transition-colors"
        onClick={() => isMobile && setMobileSidebarOpen(false)}
      >
        <div className="bg-brand flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white">
          H
        </div>
        <AnimatePresence mode="wait">
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="overflow-hidden whitespace-nowrap leading-tight"
            >
              <div className="text-sidebar-foreground text-sm font-semibold">
                {siteConfig.name}
              </div>
              <div className="text-hint text-xs">{siteConfig.version}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </Link>

      {/* 主导航 */}
      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-2">
        {topNavItems.map((item) => (
          <SidebarNavItem
            key={item.href}
            item={item}
            collapsed={sidebarCollapsed}
          />
        ))}

        {/* 分隔线 */}
        {!sidebarCollapsed && (
          <div className="border-sidebar-border my-2 border-t" />
        )}

        {/* 可展开的"最近"面板 */}
        <SidebarRecent collapsed={sidebarCollapsed} />
      </nav>

      {/* 左下角固定设置 */}
      <div className="border-sidebar-border space-y-1 border-t px-3 py-3">
        {bottomNav.map((item) => (
          <SidebarNavItem
            key={item.href}
            item={item}
            collapsed={sidebarCollapsed}
          />
        ))}
      </div>

      {/* 桌面端：收起/展开按钮 */}
      {!isMobile && (
        <div className="border-sidebar-border flex justify-end border-t px-3 py-2">
          <button
            type="button"
            onClick={toggleSidebar}
            className="hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground flex size-7 items-center justify-center rounded-full transition-colors"
            aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </button>
        </div>
      )}
    </div>
  );

  // ---- 渲染逻辑 ----
  return (
    <>
      {/* ========== 桌面端：固定宽度侧边栏（带动画） ========== */}
      {showContentDesktop && (
        <motion.aside
          initial={false}
          animate={{ width: sidebarCollapsed ? 64 : 256 }}
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
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="fixed left-0 top-0 z-50 h-full w-64"
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
