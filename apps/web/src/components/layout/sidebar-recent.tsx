"use client";

import { memo, useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Clock,
  ChevronDown,
  ArrowRight,
  MessageSquare,
  CheckSquare,
  FolderKanban,
  File,
  Zap,
  Workflow,
  Plug,
  ShieldCheck,
  Monitor,
} from "lucide-react";
import { RelativeTime } from "@/components/common/relative-time";
import { useRecentRecords } from "@/hooks/use-recent-records";
import type { RecentRecordItem } from "@/lib/api-client";

/** 类型 → 图标配置 */
const TYPE_ICON: Record<RecentRecordItem["type"], typeof Clock> = {
  conversation: MessageSquare,
  task: CheckSquare,
  project: FolderKanban,
  file: File,
  upgrade: Zap,
  workflow: Workflow,
  connector: Plug,
  approval: ShieldCheck,
  system: Monitor,
};

/**
 * 侧边栏"最近"可展开面板
 * —— 从 AuditLog 聚合数据源获取（useRecentRecords）
 *    与 /recent 页面共享 TanStack Query 缓存
 *    当前路由为 /recent 时自动展开
 *    侧边栏收起时自动折叠二级展开
 *
 * PERF: 不使用 framer-motion，改用 CSS transition 处理展开/收起。
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

  // 从 AuditLog 聚合数据源获取（与 /recent 页面共享缓存）
  // 折叠态禁用查询 + 轮询，避免全站后台流量
  const { data: apiRecords = [], isLoading } = useRecentRecords("all", shouldLoadRecent);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // 取前 8 条并按时间排序
  const recentRecords = useMemo(() => {
    if (!mounted || !shouldLoadRecent) return [];
    return [...apiRecords]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);
  }, [apiRecords, mounted, shouldLoadRecent]);

  /** 收起态时强制折叠 */
  const effectiveExpanded = collapsed ? false : expanded;

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div className="w-full">
      {collapsed ? (
        /* 折叠态：独立居中图标链接 */
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
              {isLoading && recentRecords.length === 0 ? (
                <div className="mt-2 ml-1 text-xs text-hint">加载中…</div>
              ) : recentRecords.length === 0 ? (
                <div className="mt-2 ml-1 text-xs text-hint">暂无最近记录</div>
              ) : (
                <div className="mt-1 ml-1 space-y-0.5 pr-2">
                  {recentRecords.map((record) => {
                    const Icon = TYPE_ICON[record.type] ?? Clock;
                    return (
                      <Link
                        key={record.id}
                        href={record.href}
                        prefetch={false}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-md",
                          "hover:bg-sidebar-accent transition-colors",
                        )}
                      >
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
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
              )}
            </div>
          </div>

          {/* 查看全部 */}
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
