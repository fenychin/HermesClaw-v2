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
    <div>
      {/* 触发行：图标 + 文字 + 下拉箭头 */}
      <button
        type="button"
        onClick={toggleExpanded}
        className={cn(
          "w-full flex items-center gap-3 rounded-xl px-3 h-10 text-sm font-medium transition-all duration-150",
          "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          isActive && "bg-accent text-foreground",
          collapsed && "justify-center px-0",
        )}
        title={collapsed ? "最近" : undefined}
      >
        <Clock className="size-[18px] shrink-0" />
        <span
          className={cn(
            "truncate flex-1 text-left transition-all duration-150 ease-in-out inline-block",
            collapsed ? "opacity-0 w-0" : "opacity-100 w-auto",
          )}
        >
          最近
        </span>
        <span
          className={cn(
            "shrink-0 overflow-hidden transition-all duration-150 ease-out",
            collapsed ? "opacity-0 w-0" : "opacity-100 w-auto",
            effectiveExpanded && "rotate-180",
          )}
        >
          <ChevronDown className="size-3.5" />
        </span>
      </button>

      {/* 展开区域（仅非折叠态可展开） */}
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

            {/* 查看全部 */}
            <Link
              href="/recent"
              prefetch={false}
              className={cn(
                "flex items-center justify-center gap-1 py-1.5 mt-1",
                "text-hint hover:text-sidebar-foreground text-[11px]",
                "hover:bg-sidebar-accent rounded-md transition-colors",
              )}
            >
              <span>查看全部</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
});
