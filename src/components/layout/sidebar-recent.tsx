"use client";

import { memo, useState, useMemo } from "react";
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
import { RelativeTime } from "@/components/common/relative-time";
import { useRecentConversations } from "@/hooks/use-recent-conversations";
import type { RecentType } from "@/hooks/use-recent-conversations";

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

// ============================================================
// 组件
// ============================================================

/**
 * 侧边栏"最近"可展开面板
 * —— 点击展开/收起最近对话、任务与项目记录
 *    当前路由为 /recent 时自动展开
 *    侧边栏收起时自动折叠二级展开
 */
export const SidebarRecent = memo(function SidebarRecent({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === "/recent" || pathname.startsWith("/recent/");
  const [expanded, setExpanded] = useState(isActive);

  // 从 API 获取真实对话列表（共享 hook：含自动刷新）
  const { apiConversations } = useRecentConversations();

  // 仅取 API 真实最近对话并按更新时间排序展示（与右下角最近对话保持一致）
  const recentRecords = useMemo(() => {
    return [...apiConversations]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);
  }, [apiConversations]);

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
            collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
          )}
        >
          最近
        </span>
        <motion.span
          animate={{
            rotate: effectiveExpanded ? 180 : 0,
            opacity: collapsed ? 0 : 1,
            width: collapsed ? 0 : "auto",
          }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="shrink-0 overflow-hidden"
        >
          <ChevronDown className="size-3.5" />
        </motion.span>
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
                const linkHref = `/new?load=${record.id}`;
                return (
                  <Link
                    key={record.id}
                    href={linkHref}
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
});
