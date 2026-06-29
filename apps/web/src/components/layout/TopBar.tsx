"use client";

import { memo, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Menu,
  Bell,
  ChevronRight,
  CheckCheck,
  Info,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { mainNav, bottomNav, brainNav, knowledgeNav } from "@/config/navigation";
import { useUiStore, type Notification } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

// ============================================================
// Mock 通知数据（模块级常量，不在渲染函数内）
// ============================================================

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "notif-1",
    type: "success",
    title: "智能体 Leon 升级完成",
    message: "Leon v2.3 已就绪，新增邮件模板 A/B 测试能力",
    read: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "notif-2",
    type: "warning",
    title: "汇率预警",
    message: "USD/CNY 突破 7.25，建议关注出口报价窗口",
    read: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "notif-3",
    type: "info",
    title: "新连接器可用",
    message: "Shopify Plus 连接器已上线，可接入独立站数据",
    read: true,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: "notif-4",
    type: "error",
    title: "Gmail 连接器授权过期",
    message: "请重新授权 Gmail 连接器以恢复邮件采集",
    read: false,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "notif-5",
    type: "info",
    title: "Harness 评估完成",
    message: "3 条新提案待审批，涉及邮件采集与客户画像逻辑",
    read: true,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
];

// ============================================================
// 工具函数
// ============================================================

/** 通知图标映射 */
function NotificationIcon({ type }: { type: Notification["type"] }) {
  switch (type) {
    case "success":
      return <CheckCircle2 className="text-success size-4 shrink-0" />;
    case "warning":
      return <AlertTriangle className="text-warning size-4 shrink-0" />;
    case "error":
      return <XCircle className="text-danger size-4 shrink-0" />;
    case "info":
    default:
      return <Info className="text-brand-blue size-4 shrink-0" />;
  }
}

/** 格式化时间（简短） */
function shortTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const days = Math.floor(hr / 24);
  return `${days}天前`;
}

/** 全量导航项（合并主导航 + 底部导航，避免在渲染中重复创建） */
const ALL_NAV = [...mainNav, ...bottomNav];

/** 从导航配置中获取当前页面面包屑 */
function useBreadcrumb() {
  const pathname = usePathname();

  // 1. 优先匹配具体的“资料库”二级页面，避免被 “/knowledge” 记忆体模糊匹配截胡
  const knowledgeItem = knowledgeNav.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  if (knowledgeItem) {
    return [
      { label: "资料库", href: "/files" },
      { label: knowledgeItem.label, href: knowledgeItem.href },
    ];
  }

  // 2. 匹配具体的智慧大脑二级页面（如智能体、记忆体等）
  const brainItem = brainNav.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  if (brainItem) {
    return [
      { label: "智慧大脑", href: "/brain/memory" },
      { label: brainItem.label, href: brainItem.href },
    ];
  }

  // 精确匹配主导航（含底部导航）
  const mainItem = ALL_NAV.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  if (mainItem) {
    return [{ label: mainItem.label, href: mainItem.href }];
  }

  // 兜底
  return [{ label: "工作台", href: "/" }];
}
// 子组件 1：Breadcrumb
// 唯一订阅源：useBreadcrumb()（内含 usePathname()）
// 路由切换时只有此组件重渲染，其余子组件不受影响
// ============================================================

const Breadcrumb = memo(function Breadcrumb() {
  const breadcrumb = useBreadcrumb();

  return (
    <nav className="flex items-center gap-1.5 text-sm">
      {breadcrumb.map((crumb, i) => (
        <span key={`${crumb.href}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && (
            <ChevronRight className="text-hint size-3.5 shrink-0" />
          )}
          <span
            className={cn(
              i === breadcrumb.length - 1
                ? "text-foreground font-medium"
                : "text-muted-foreground",
            )}
          >
            {crumb.label}
          </span>
        </span>
      ))}
    </nav>
  );
});

// ============================================================
// 子组件 2：NotificationBell
// 唯一订阅源：useUiStore 中的 notificationPanelOpen /
//             setNotificationPanelOpen / markAllNotificationsRead
// ============================================================

const NotificationBell = memo(function NotificationBell() {
  const notificationPanelOpen = useUiStore((s) => s.notificationPanelOpen);
  const setNotificationPanelOpen = useUiStore(
    (s) => s.setNotificationPanelOpen,
  );
  const markAllNotificationsRead = useUiStore(
    (s) => s.markAllNotificationsRead,
  );

  const notifications = MOCK_NOTIFICATIONS;
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setNotificationPanelOpen(!notificationPanelOpen)}
        className={cn(
          "hover:bg-accent text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-lg transition-colors",
          notificationPanelOpen && "bg-accent text-foreground",
        )}
        aria-label="通知"
      >
        <Bell className="size-4" />
        {/* 未读红点 */}
        {unreadCount > 0 && (
          <span className="bg-danger absolute right-1 top-1 flex size-2 items-center justify-center rounded-full ring-2 ring-background" />
        )}
      </button>

      {/* 通知弹出面板 */}
      <AnimatePresence>
        {notificationPanelOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="bg-popover border-border absolute right-0 top-full mt-2 w-80 rounded-xl border shadow-xl"
          >
            {/* 面板头 */}
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-foreground text-sm font-semibold">
                通知
              </h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllNotificationsRead}
                  className="text-brand hover:text-brand/80 flex items-center gap-1 text-xs font-medium transition-colors"
                >
                  <CheckCheck className="size-3" />
                  全部已读
                </button>
              )}
            </div>

            {/* 通知列表 */}
            <div className="max-h-[320px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="text-hint px-4 py-8 text-center text-xs">
                  暂无通知
                </div>
              ) : (
                notifications.map((notif) => (
                  <button
                    key={notif.id}
                    type="button"
                    className={cn(
                      "hover:bg-accent/60 flex w-full gap-3 px-4 py-3 text-left transition-colors",
                      !notif.read && "bg-accent/30",
                    )}
                  >
                    <div className="mt-0.5">
                      <NotificationIcon type={notif.type} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            "text-sm leading-snug",
                            notif.read
                              ? "text-muted-foreground"
                              : "text-foreground font-medium",
                          )}
                        >
                          {notif.title}
                        </p>
                        {!notif.read && (
                          <span className="bg-brand mt-1.5 size-1.5 shrink-0 rounded-full" />
                        )}
                      </div>
                      <p className="text-hint mt-0.5 line-clamp-1 text-xs">
                        {notif.message}
                      </p>
                      <p className="text-hint mt-1 text-[10px]">
                        {shortTime(notif.createdAt)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ============================================================
// 子组件 3：UserAvatar
// 唯一订阅源：useSession()（完全隔离 session 订阅）
// session 变化时只有此组件重渲染
// ============================================================

// ============================================================
// 子组件 4：CommandPaletteHint
// 无 store 订阅；接收父组件传入的稳定 onClick 引用
// ============================================================

const CommandPaletteHint = memo(function CommandPaletteHint({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-accent text-hint hover:text-foreground hidden items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors sm:flex"
    >
      <kbd className="font-mono text-[10px]">⌘</kbd>
      <kbd className="font-mono text-[10px]">K</kbd>
    </button>
  );
});

// ============================================================
// TopBar 主组件
// 唯一订阅源：useUiStore 中的 toggleMobileSidebar /
//             setCommandPaletteOpen（均为稳定函数引用）
// 路由切换、session 变化、通知状态变化均不触发主组件重渲染
// ============================================================

/**
 * 主内容区顶部 TopBar
 * —— 左侧：hamburger（移动端）+ Breadcrumb
 * —— 右侧：CommandPaletteHint + NotificationBell + UserAvatar
 */
export const TopBar = memo(function TopBar() {
  const toggleMobileSidebar = useUiStore((s) => s.toggleMobileSidebar);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);

  // 稳定引用，避免 CommandPaletteHint 因 props 变化重渲染
  const handleOpenCommandPalette = useCallback(
    () => setCommandPaletteOpen(true),
    [setCommandPaletteOpen],
  );

  return (
    <header className="border-border bg-background/80 sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-b px-4 backdrop-blur-sm">
      {/* ---- 左侧 ---- */}
      <div className="flex items-center gap-3">
        {/* Hamburger（仅移动端可见） */}
        <button
          type="button"
          onClick={toggleMobileSidebar}
          className="text-muted-foreground hover:text-foreground hover:bg-accent flex size-8 items-center justify-center rounded-lg transition-colors lg:hidden"
          aria-label="打开菜单"
        >
          <Menu className="size-4" />
        </button>

        <Breadcrumb />
      </div>

      {/* ---- 右侧 ---- */}
      <div className="flex items-center gap-3">
        <CommandPaletteHint onClick={handleOpenCommandPalette} />
        <NotificationBell />
      </div>
    </header>
  );
});
