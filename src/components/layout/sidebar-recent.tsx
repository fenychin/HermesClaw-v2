"use client";

import { useState, useMemo, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Clock,
  ChevronDown,
  MessageSquare,
  ListTodo,
  FolderKanban,
  ArrowRight,
} from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { useTradeStore } from "@/stores/trade-store";
import type { Inquiry } from "@/types";

// ============================================================
// 数据层（复刻 recent-panel 逻辑，保持一致性）
// ============================================================

type RecentType = "conversation" | "task" | "project";

interface RecentRecord {
  id: string;
  type: RecentType;
  title: string;
  timestamp: string;
}

const TYPE_ICON: Record<RecentType, typeof MessageSquare> = {
  conversation: MessageSquare,
  task: ListTodo,
  project: FolderKanban,
};

const TYPE_COLOR: Record<RecentType, string> = {
  conversation: "text-brand-blue",
  task: "text-warning",
  project: "text-success",
};

function relativeTime(isoStr: string): string {
  const now = Date.now();
  const diffMs = now - new Date(isoStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "昨天";
  if (diffDay < 7) return `${diffDay}天前`;
  return new Date(isoStr).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

/** 构建最近记录（在组件内 useMemo，使用 store 数据） */
function buildRecentRecords(
  storeProjects: { id: string; name: string; updatedAt: string }[],
  inquiries: Inquiry[],
): RecentRecord[] {
  const conversations: RecentRecord[] = inquiries.slice(0, 4).map((inq) => ({
    id: inq.id,
    type: "conversation" as RecentType,
    title: inq.companyName,
    timestamp: inq.receivedAt,
  }));

  const projects: RecentRecord[] = storeProjects.slice(0, 2).map((proj) => ({
    id: proj.id,
    type: "project" as RecentType,
    title: proj.name,
    timestamp: proj.updatedAt,
  }));

  const now = new Date();
  const tasks: RecentRecord[] = [
    {
      id: "task-recent-001",
      type: "task",
      title: "Sakura 样品质量整改",
      timestamp: new Date(now.getTime() - 45 * 60000).toISOString(),
    },
    {
      id: "task-recent-002",
      type: "task",
      title: "BrightPath 报价单修订",
      timestamp: new Date(now.getTime() - 120 * 60000).toISOString(),
    },
  ];

  return [...conversations, ...projects, ...tasks].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

// ============================================================
// 组件
// ============================================================

/**
 * 侧边栏"最近"可展开面板
 * —— 点击展开/收起最近对话、任务与项目记录
 *    当前路由为 /recent 时自动展开
 *    侧边栏收起时自动折叠二级展开
 */
export function SidebarRecent({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === "/recent" || pathname.startsWith("/recent/");
  const [expanded, setExpanded] = useState(isActive);

  const storeProjects = useProjectStore((s) => s.projects);
  const inquiries = useTradeStore((s) => s.inquiries);
  const loadInquiries = useTradeStore((s) => s.loadInquiries);
  useEffect(() => {
    loadInquiries();
  }, [loadInquiries]);
  const recentRecords = useMemo(
    () => buildRecentRecords(storeProjects, inquiries),
    [storeProjects, inquiries],
  );

  /** 收起态时强制折叠（派生状态，避免在 effect 中 setState） */
  const effectiveExpanded = collapsed ? false : expanded;

  return (
    <div>
      {/* 触发行：图标 + 文字 + 下拉箭头 */}
      <button
        type="button"
        onClick={() => {
          setExpanded(!effectiveExpanded);
        }}
        className={cn(
          "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
          isActive && "bg-sidebar-accent text-sidebar-foreground",
          collapsed && "justify-center px-2",
        )}
        title={collapsed ? "最近" : undefined}
      >
        <Clock className="size-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="truncate flex-1 text-left">最近</span>
            <motion.span
              animate={{ rotate: effectiveExpanded ? 180 : 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="shrink-0"
            >
              <ChevronDown className="size-3.5" />
            </motion.span>
          </>
        )}
      </button>

      {/* 展开区域（仅非折叠态可展开） */}
      <AnimatePresence initial={false}>
        {effectiveExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-1 ml-9 space-y-0.5 pr-2">
              {recentRecords.map((record) => {
                const Icon = TYPE_ICON[record.type];
                return (
                  <Link
                    key={record.id}
                    href="/recent"
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-md",
                      "hover:bg-sidebar-accent transition-colors",
                    )}
                  >
                    <Icon
                      className={cn("size-3 shrink-0", TYPE_COLOR[record.type])}
                    />
                    <span className="text-sidebar-foreground text-xs truncate flex-1">
                      {record.title}
                    </span>
                    <span className="text-hint text-[10px] shrink-0">
                      {relativeTime(record.timestamp)}
                    </span>
                  </Link>
                );
              })}

              {/* 查看全部 */}
              <Link
                href="/recent"
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
