"use client";

import { useMemo, useEffect, useState } from "react";
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
import { apiClient } from "@/lib/api-client";
import { relativeTime, classifyTimeGroup } from "@/lib/date-utils";
import type { Inquiry } from "@/types";

// ============================================================
// 数据类型定义
// ============================================================

type RecentType = "conversation" | "task" | "project";

export interface RecentRecord {
  id: string;
  type: RecentType;
  title: string;
  timestamp: string;
  /**
   * 可选导航目标：存在时点击直接跳转该路由（用于询盘派生「对话」等无真实对话记录的项）；
   * 为空且 type==="conversation" 时按真实对话 ID 加载历史会话。
   */
  href?: string;
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

/** 从 store 数据生成混合最近记录 */
function buildRecentRecords(
  storeProjects: { id: string; name: string; updatedAt: string }[],
  inquiries: Inquiry[],
): RecentRecord[] {
  // 对话 → 来自询盘（DB 数据）。这些并非真实 Conversation 记录，
  // 点击应跳转外贸询盘板块而非按假 ID 加载会话（避免必然 404）。
  const conversations: RecentRecord[] = inquiries
    .slice(0, 4)
    .map((inq) => ({
      id: inq.id,
      type: "conversation" as RecentType,
      title: inq.companyName,
      timestamp: inq.receivedAt,
      href: "/foreign-trade",
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

  // 从 API 加载真实对话列表
  const [apiConversations, setApiConversations] = useState<RecentRecord[]>([]);
  useEffect(() => {
    loadInquiries();
    // 异步加载真实对话
    apiClient.getConversations().then((data) => {
      const convs = (data as { conversations: Array<{ id: string; title: string; updatedAt: string }> }).conversations ?? [];
      setApiConversations(
        convs.map((c) => ({
          id: c.id,
          type: "conversation" as const,
          title: c.title,
          timestamp: c.updatedAt,
          timeGroup: classifyTimeGroup(c.updatedAt),
        })),
      );
    }).catch(() => { /* 对话列表加载失败不阻断面板 */ });
  }, [loadInquiries]);

  const recentRecords = useMemo(
    () => {
      const base = buildRecentRecords(storeProjects, inquiries);
      // 合并 API 对话（去重：API 真实对话优先于询盘派生的"对话"）
      const seen = new Set(apiConversations.map((c) => c.title));
      const filtered = base.filter((r) => r.type !== "conversation" || !seen.has(r.title));
      return [...apiConversations, ...filtered]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 12);
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
