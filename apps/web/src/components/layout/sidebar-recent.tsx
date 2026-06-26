"use client";

import { memo, useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Clock,
  ChevronDown,
  ArrowRight,
} from "lucide-react";
import { RelativeTime } from "@/components/common/relative-time";
import { useRecentConversations } from "@/hooks/use-recent-conversations";

/**
 * 侧边栏"最近"可展开面板
 * —— 点击展开/收起最近对话、任务与项目记录
 *    当前路由为 /recent 时自动展开
 *    侧边栏收起时自动折叠二级展开
 *
 * PERF: 同 SidebarBrain，不使用 framer-motion，改用 CSS transition 处理展开/收起，
 * 避免点击主板块时动画帧阻塞导致卡顿。
 */
export const SidebarRecent = memo(function SidebarRecent({
  collapsed = false,
  isActive = false,
}: {
  collapsed?: boolean;
  isActive?: boolean;
}) {
  const [expanded, setExpanded] = useState(isActive);
  const shouldLoadRecent = !collapsed && (expanded || isActive);

  // 从 API 获取真实对话列表（共享 hook：含自动刷新）
  const { apiConversations } = useRecentConversations(shouldLoadRecent);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // 仅取 API 真实最近对话并按更新时间排序展示（与右下角最近对话保持一致）
  const recentRecords = useMemo(() => {
    if (!mounted) return [];
    return [...apiConversations]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);
  }, [apiConversations, mounted]);

  /** 收起态时强制折叠（派生状态，避免在 effect 中 setState） */
  const effectiveExpanded = collapsed ? false : expanded;

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div className="w-full">
      {collapsed ? (
        /* 折叠态：独立居中图标链接，避免隐藏 span 干扰布局 */
        <Link
          href="/recent"
          className={cn(
            "w-full h-10 flex items-center justify-center rounded-xl transition-all duration-150",
            isActive
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
          title="最近"
        >
          <Clock className="size-[18px] shrink-0" />
        </Link>
      ) : (
        <>
          {/* 展开态触发行 */}
          <button
            type="button"
            onClick={toggleExpanded}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl px-3 h-10 text-sm font-medium transition-all duration-150 select-none cursor-pointer",
              "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              isActive && "bg-accent text-foreground",
            )}
          >
            <Clock className="size-[18px] shrink-0" />
            <span className="truncate flex-1 text-left">最近</span>
            <span
              className={cn(
                "shrink-0 flex items-center justify-center text-muted-foreground/60 transition-transform duration-150 ease-out",
                effectiveExpanded && "rotate-180",
              )}
            >
              <ChevronDown className="size-3.5" />
            </span>
          </button>

          {/* 可折叠内容区 */}
          <div
            className={cn(
              "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
              effectiveExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="min-h-0">
              <div className="mt-1 ml-1 space-y-0.5 pr-2">
                {recentRecords.map((record) => {
                  const linkHref = `/new?load=${record.id}`;
                  return (
                    <Link
                      key={record.id}
                      href={linkHref}
                      prefetch={false}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md",
                        "hover:bg-sidebar-accent transition-colors",
                      )}
                    >
                      <span className="text-sidebar-foreground text-xs truncate flex-1">
                        {record.title}
                      </span>
                      <RelativeTime
                        value={record.timestamp}
                        className="text-hint text-[10px] shrink-0"
                      />
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 查看全部：展开态始终可见，移出折叠 grid */}
          {effectiveExpanded && (
            <Link
              href="/recent"
              prefetch={false}
              className={cn(
                "flex items-center justify-center gap-1 px-3 py-1.5 mt-0.5 rounded-xl",
                "text-hint hover:text-sidebar-foreground text-[11px]",
                "hover:bg-accent/50 transition-colors",
              )}
            >
              <span>查看全部</span>
              <ArrowRight className="size-3" />
            </Link>
          )}
        </>
      )}
    </div>
  );
});
