"use client";

import { useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Clock,
  MessageSquare,
  ListTodo,
  FolderKanban,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { useProjectStore } from "@/stores/project-store";
import { useTradeStore } from "@/stores/trade-store";
import { relativeTime } from "@/lib/date-utils";
import { buildRecentRecords } from "@/lib/recent-utils";
import { useRecentConversations } from "@/hooks/use-recent-conversations";
import type { RecentRecord, RecentType } from "@/hooks/use-recent-conversations";

/** 类型 → 图标映射 */
const TYPE_ICON: Record<RecentType, typeof MessageSquare> = {
  conversation: MessageSquare,
  task: ListTodo,
  project: FolderKanban,
};

/** 类型 → 图标色 */
const TYPE_COLOR: Record<RecentType, string> = {
  conversation: "text-brand-blue",
  task: "text-warning",
  project: "text-success",
};

// ============================================================
// 组件
// ============================================================

interface RecentPanelProps {
  /** 点击某条记录时的回调（传递完整记录，调用方可按 type 分发处理） */
  onSelect?: (record: RecentRecord) => void;
  /** 是否显示底部"查看全部"链接（/recent 页面自身不显示） */
  showViewAll?: boolean;
  /** 是否显示顶部标题行 */
  showTitle?: boolean;
}

/**
 * 最近动态面板
 * —— 展示混合的最近对话、任务与项目记录
 *    复用于新话题页左栏与 /recent 独立页
 */
export function RecentPanel({
  onSelect,
  showViewAll = true,
  showTitle = true,
}: RecentPanelProps) {
  const storeProjects = useProjectStore((s) => s.projects);
  const inquiries = useTradeStore((s) => s.inquiries);
  const loadInquiries = useTradeStore((s) => s.loadInquiries);

  // 从 API 加载真实对话列表（共享 hook：含自动刷新）
  const { apiConversations } = useRecentConversations();

  useEffect(() => {
    loadInquiries();
  }, [loadInquiries]);

  const recentRecords = useMemo(
    () => {
      const base = buildRecentRecords(storeProjects, inquiries);
      // 合并 API 对话（去重：API 真实对话优先于询盘派生的"对话"）
      const seen = new Set(apiConversations.map((c) => c.title));
      const filtered = base.filter((r) => r.type !== "conversation" || !seen.has(r.title));
      return [...apiConversations, ...filtered]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5);
    },
    [storeProjects, inquiries, apiConversations],
  );

  return (
    <motion.aside
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.05, ease: "easeOut" }}
      className="flex flex-col h-full"
    >
      {/* 标题 */}
      {showTitle && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <Clock className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            最近
          </span>
        </div>
      )}

      {/* 记录列表 */}
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {recentRecords.map((record, i) => {
          const Icon = TYPE_ICON[record.type];
          return (
            <motion.button
              key={record.id}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.2,
                delay: 0.08 + i * 0.03,
                ease: "easeOut",
              }}
              onClick={() => onSelect?.(record)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg",
                "hover:bg-accent transition-colors text-left",
              )}
            >
              {/* 类型图标 */}
              <Icon
                className={cn("size-3.5 shrink-0", TYPE_COLOR[record.type])}
              />

              {/* 标题（截断 1 行） */}
              <span className="text-foreground text-xs truncate flex-1">
                {record.title}
              </span>

              {/* 相对时间 */}
              <span className="text-hint text-[10px] shrink-0">
                {relativeTime(record.timestamp)}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* 底部：查看全部（/recent 自身不显示） */}
      {showViewAll && (
        <Link
          href="/recent"
          className={cn(
            "flex items-center justify-center gap-1.5 mt-3 py-2",
            "text-hint hover:text-muted-foreground text-xs",
            "hover:bg-accent rounded-lg transition-colors",
          )}
        >
          <span>查看全部</span>
          <ArrowRight className="size-3" />
        </Link>
      )}
    </motion.aside>
  );
}
