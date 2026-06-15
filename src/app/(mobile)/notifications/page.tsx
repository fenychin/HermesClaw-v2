// ⚠️ MOBILE PREVIEW — PRD §9.3 暂缓项，UI 在 fixture 数据上演示
"use client";

import { useState } from "react";
import {
  Bell,
  BellRing,
  Bot,
  FileText,
  Mail,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MOCK_NOTIFICATIONS,
  type MobileNotification,
  type MobileNotificationType as NotificationType,
} from "../_fixtures/mock-notifications";

// 类型与数据已在文件顶部从 ../_fixtures/mock-notifications 导入

/** 通知类型图标与颜色映射 */
const typeConfig: Record<
  NotificationType,
  { icon: typeof Bell; className: string; bgClass: string }
> = {
  "task:started": {
    icon: Bot,
    className: "text-brand-blue",
    bgClass: "bg-brand-blue/10",
  },
  "task:completed": {
    icon: CheckCircle2,
    className: "text-success",
    bgClass: "bg-success/10",
  },
  "task:failed": {
    icon: AlertTriangle,
    className: "text-danger",
    bgClass: "bg-danger/10",
  },
  "approval:requested": {
    icon: FileText,
    className: "text-warning",
    bgClass: "bg-warning/10",
  },
  "approval:resolved": {
    icon: CheckCircle2,
    className: "text-success",
    bgClass: "bg-success/10",
  },
  "email:received": {
    icon: Mail,
    className: "text-brand-blue",
    bgClass: "bg-brand-blue/10",
  },
  "system:alert": {
    icon: AlertTriangle,
    className: "text-danger",
    bgClass: "bg-danger/10",
  },
  "system:info": { icon: Bell, className: "text-muted-foreground", bgClass: "bg-accent" },
};

/** 模拟通知数据已迁移至 ../_fixtures/mock-notifications.ts */

/**
 * 移动端系统事件通知流
 * —— 集成 OpenClaw SSE 事件推送的所有系统通知
 * —— 支持标记已读/全部已读
 */
export default function MobileNotificationsPage() {
  const [notifications, setNotifications] =
    useState<MobileNotification[]>(MOCK_NOTIFICATIONS);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const unreadCount = notifications.filter((n) => !n.read).length;

  /** 标记单条已读 */
  function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }

  /** 全部标记已读 */
  function markAllRead() {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true })),
    );
  }

  const filtered =
    filter === "unread"
      ? notifications.filter((n) => !n.read)
      : notifications;

  return (
    <div className="flex flex-col gap-4">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-lg font-semibold tracking-tight">
            系统通知
          </h1>
          <p className="text-hint text-xs mt-0.5">
            {unreadCount > 0
              ? `${unreadCount} 条未读`
              : "全部已读"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-primary text-xs font-medium min-h-11 px-2 flex items-center active:text-primary/70 transition-colors touch-manipulation"
            >
              全部已读
            </button>
          )}
        </div>
      </div>

      {/* 过滤栏 */}
      <div className="flex items-center gap-2">
        {(
          [
            { key: "all", label: "全部" },
            { key: "unread", label: "未读" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium min-h-11 flex items-center",
              "transition-colors touch-manipulation",
              filter === key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {key === "unread" && unreadCount > 0 && (
              <span className="ml-1 bg-primary-foreground/20 rounded-full px-1.5 text-xs">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 通知列表 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BellRing className="size-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground text-sm">暂无通知</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {filtered.map((notification) => {
            const config = typeConfig[notification.type];
            const Icon = config.icon;

            return (
              <button
                key={notification.id}
                type="button"
                onClick={() => markRead(notification.id)}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-2xl text-left w-full",
                  "transition-colors active:bg-accent touch-manipulation",
                  !notification.read && "bg-accent/50",
                )}
              >
                {/* 图标 */}
                <div
                  className={cn(
                    "shrink-0 rounded-xl p-2 mt-0.5",
                    config.bgClass,
                  )}
                >
                  <Icon className={cn("size-4", config.className)} />
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3
                      className={cn(
                        "text-foreground text-sm font-medium",
                        !notification.read && "font-semibold",
                      )}
                    >
                      {notification.title}
                    </h3>
                    {!notification.read && (
                      <span className="shrink-0 size-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <p className="text-hint text-xs line-clamp-2 mb-1.5">
                    {notification.description}
                  </p>
                  <span className="text-muted-foreground text-[10px]">
                    {notification.timestamp}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
