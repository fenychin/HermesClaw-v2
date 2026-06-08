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
import type { Inquiry } from "@/types";

// ============================================================
// 数据类型定义
// ============================================================

type RecentType = "conversation" | "task" | "project";

interface RecentRecord {
  id: string;
  type: RecentType;
  title: string;
  timestamp: string;
}

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
// 构建混合最近记录（8 条）
// ============================================================

/** 相对时间格式化（中文） */
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

/** 从 store 数据生成混合最近记录 */
function buildRecentRecords(
  storeProjects: { id: string; name: string; updatedAt: string }[],
  inquiries: Inquiry[],
): RecentRecord[] {
  // 对话 → 来自询盘（DB 数据）
  const conversations: RecentRecord[] = inquiries
    .slice(0, 4)
    .map((inq) => ({
      id: inq.id,
      type: "conversation" as RecentType,
      title: inq.companyName,
      timestamp: inq.receivedAt,
    }));

  // 项目 → 来自 store（数据库数据）
  const projects: RecentRecord[] = storeProjects.slice(0, 2).map((proj) => ({
    id: proj.id,
    type: "project" as RecentType,
    title: proj.name,
    timestamp: proj.updatedAt,
  }));

  // 任务 → 手写 2 条（mock 数据无独立 task 实体）
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

  // 合并并按时间倒序
  return [...conversations, ...projects, ...tasks].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

// ============================================================
// 组件
// ============================================================

interface RecentPanelProps {
  /** 点击某条记录时的回调（新话题页用于填入输入框） */
  onSelect?: (text: string) => void;
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
  useEffect(() => {
    loadInquiries();
  }, [loadInquiries]);
  const recentRecords = useMemo(
    () => buildRecentRecords(storeProjects, inquiries),
    [storeProjects, inquiries],
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
              onClick={() => onSelect?.(record.title)}
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
