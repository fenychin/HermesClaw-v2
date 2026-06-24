"use client";

import { memo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Brain, ChevronDown } from "lucide-react";
import { brainNav } from "@/config/navigation";

interface SidebarBrainProps {
  collapsed?: boolean;
  isActive?: boolean;
}

/**
 * 智慧大脑侧边栏下拉可折叠导航项
 * —— 左侧点击直接跳转至短期记忆 /brain/short-memory
 * —— 右侧点击 Chevron 图标实现折叠/展开子模块
 * —— 如果当前路由属于智慧大脑（pathname以/brain/开头），则高亮并默认展开
 *
 * PERF: 为避免点击主板块时产生动画帧卡顿，本组件不使用 framer-motion。
 * 旋转与高度展开全部改用 CSS transition，由浏览器合成层处理，降低主线程阻塞。
 */
export const SidebarBrain = memo(function SidebarBrain({
  collapsed = false,
  isActive = false,
}: SidebarBrainProps) {
  const pathname = usePathname();
  const router = useRouter();

  // 是否展开子菜单 (初次渲染或在大脑相关路由时，默认展开)
  const [expanded, setExpanded] = useState(isActive);

  // 当外部 isActive 变为 true 时，自动展开下拉项（方便直观跳转定位）
  useEffect(() => {
    if (isActive) {
      setExpanded(true);
    }
  }, [isActive]);

  const effectiveExpanded = collapsed ? false : expanded;

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const prewarm = useCallback(
    (href: string) => {
      router.prefetch(href);
    },
    [router],
  );

  return (
    <div className="w-full">
      {/* 触发行 */}
      {collapsed ? (
        <Link
          href="/brain/memory"
          className={cn(
            "w-full h-10 flex items-center justify-center rounded-xl transition-all duration-150",
            isActive
              ? "bg-accent text-foreground font-semibold"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
          title="智慧大脑"
          onPointerEnter={() => prewarm("/brain/memory")}
          onFocus={() => prewarm("/brain/memory")}
        >
          <Brain className={cn("size-[18px]", isActive && "text-[#6D5EF9]")} />
        </Link>
      ) : (
        <button
          type="button"
          onClick={toggleExpanded}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl px-3 h-10 text-sm font-medium transition-all duration-150 select-none cursor-pointer",
            isActive
              ? "bg-accent text-foreground font-semibold"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
          title="智慧大脑控制面"
        >
          <Brain className={cn("size-[18px] shrink-0", isActive && "text-[#6D5EF9]")} />
          <span className="truncate flex-1 text-left">智慧大脑</span>
          <span
            className={cn(
              "shrink-0 flex items-center justify-center text-muted-foreground/60 transition-transform duration-150 ease-out",
              effectiveExpanded && "rotate-180",
            )}
          >
            <ChevronDown className="size-3.5" />
          </span>
        </button>
      )}

      {/* 大脑二级子导航（平铺扁平化，仅在非折叠状态展示展开） */}
      <div
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
          effectiveExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0">
          <div className="mt-1 ml-4 space-y-0.5 border-l border-sidebar-border/40 pl-2">
            {brainNav.map((child) => {
              const ChildIcon = child.icon;
              const isChildActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onPointerEnter={() => prewarm(child.href)}
                  onFocus={() => prewarm(child.href)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors",
                    isChildActive
                      ? "bg-accent/80 text-foreground font-semibold"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                  )}
                >
                  <ChildIcon
                    className={cn(
                      "size-3.5 shrink-0",
                      isChildActive ? "text-[#6D5EF9]" : "text-muted-foreground",
                    )}
                  />
                  <span className="truncate flex-1 text-left">{child.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
