"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useRecentConversations, type RecentRecord } from "@/hooks/use-recent-conversations";
import { cn } from "@/lib/utils";
import { classifyTimeGroup, relativeTime } from "@/lib/date-utils";
import {
  MessageSquare,
  Clock,
  ChevronRight,
} from "lucide-react";

/** 时间分组 → 中文标签 */
const TIME_GROUP_LABELS: Record<string, string> = {
  today: "今天",
  yesterday: "昨天",
  this_week: "本周",
  last_week: "上周",
  this_month: "本月",
  earlier: "更早",
};

/**
 * 最近对话面板（/new 页面右栏附加区块）
 * —— 展示最近对话列表，点击跳转到 /new?load=conversationId 恢复会话
 */
export function RecentPanel() {
  const router = useRouter();
  const { apiConversations } = useRecentConversations();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const conversationsToRender = mounted ? apiConversations : [];

  // 按时间分组
  const grouped = conversationsToRender.reduce(
    (acc, record) => {
      const group = record.timeGroup || classifyTimeGroup(record.timestamp);
      if (!acc[group]) acc[group] = [];
      acc[group].push(record);
      return acc;
    },
    {} as Record<string, RecentRecord[]>,
  );

  const groups = Object.entries(grouped).sort(([a], [b]) => {
    const order = ["today", "yesterday", "this_week", "last_week", "this_month", "earlier"];
    return order.indexOf(a) - order.indexOf(b);
  });

  if (conversationsToRender.length === 0) {
    return (
      <div className="px-1 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            最近对话
          </span>
        </div>
        <p className="text-hint text-xs text-center py-6">
          暂无对话记录
        </p>
      </div>
    );
  }

  return (
    <div className="px-1">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          最近对话
        </span>
        <span className="text-hint text-[10px] ml-auto">
          {conversationsToRender.length}
        </span>
      </div>

      <div className="space-y-3">
        {groups.map(([group, records]) => (
          <div key={group}>
            <p className="text-hint text-[10px] font-medium px-1 mb-1.5">
              {TIME_GROUP_LABELS[group] ?? group}
            </p>
            <div className="space-y-0.5">
              {records.slice(0, group === "today" ? 5 : 3).map((record, i) => (
                <motion.button
                  key={record.id}
                  type="button"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.2,
                    delay: i * 0.03,
                    ease: "easeOut",
                  }}
                  onClick={() => {
                    router.push(`/new?load=${record.id}`);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg",
                    "hover:bg-accent transition-colors text-left group",
                  )}
                >
                  <MessageSquare className="size-3.5 text-hint shrink-0 group-hover:text-muted-foreground" />
                  <span className="text-foreground text-xs truncate flex-1">
                    {record.title}
                  </span>
                  <span className="text-hint text-[10px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {relativeTime(record.timestamp)}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 查看全部 */}
      {apiConversations.length > 5 && (
        <button
          type="button"
          onClick={() => router.push("/recent")}
          className="w-full flex items-center justify-center gap-1 mt-3 py-1.5 text-hint text-xs hover:text-muted-foreground transition-colors"
        >
          查看全部
          <ChevronRight className="size-3" />
        </button>
      )}
    </div>
  );
}
