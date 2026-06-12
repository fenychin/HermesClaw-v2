"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { mainNav, bottomNav } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { useUiStore } from "@/stores/ui-store";
import { SidebarNavItem } from "./sidebar-nav-item";
import { SidebarRecent } from "./sidebar-recent";
import { cn } from "@/lib/utils";

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
      {/* 品牌与折叠区 */}
      <div
        className={cn(
          "flex h-14 items-center px-4 transition-all duration-150 shrink-0",
          sidebarCollapsed ? "justify-center" : "justify-between"
        )}
      >
        <Link
          href={siteConfig.defaultRoute}
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
              <SidebarRecent key={item.href} collapsed={sidebarCollapsed} />
            );
          }
          return (
            <SidebarNavItem
              key={item.href}
              item={item}
              collapsed={sidebarCollapsed}
            />
          );
        })}
      </nav>

      {/* 左下角固定设置 */}
      <div className="mt-auto space-y-1 px-3 py-3 shrink-0">
        {bottomNav.map((item) => (
          <SidebarNavItem
            key={item.href}
            item={item}
            collapsed={sidebarCollapsed}
          />
        ))}
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
