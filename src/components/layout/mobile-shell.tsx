"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ClipboardList, ShieldCheck, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileCheckin } from "@/hooks/use-mobile-checkin";

/** 底部 Tab 导航定义 */
const MOBILE_TABS = [
  {
    href: "/mobile/tasks",
    label: "任务",
    icon: ClipboardList,
  },
  {
    href: "/mobile/approvals",
    label: "审批",
    icon: ShieldCheck,
  },
  {
    href: "/mobile/notifications",
    label: "通知",
    icon: Bell,
  },
] as const;

/**
 * 移动端外壳：主内容区 + 底部 Tab 导航栏
 * —— 使用 min-h-dvh 适配移动端地址栏动态显隐
 * —— 触摸目标区域 ≥ 44px（Tailwind h-11 = 44px）
 * —— 底部导航安全区适配（safe-area-inset-bottom）
 */
export function MobileShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  /** 移动端环境签到：上报时区、设备类型、PWA 运行模式 */
  useMobileCheckin();

  /** 判断当前 Tab 是否激活 */
  function isActive(href: string) {
    return pathname.startsWith(href);
  }

  return (
    <div className="bg-background flex flex-col min-h-dvh pb-[env(safe-area-inset-bottom,0px)]">
      {/* 主内容滚动区 */}
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-20">
        {children}
      </main>

      {/* 底部 Tab 导航栏 */}
      <nav
        className="
          fixed bottom-0 inset-x-0 z-50
          flex items-center justify-around
          h-16 pb-[env(safe-area-inset-bottom,4px)]
          bg-sidebar border-t border-border
        "
        role="navigation"
        aria-label="移动端主导航"
      >
        {MOBILE_TABS.map((tab) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 min-w-0 px-3 py-2 rounded-xl min-h-11",
                "transition-colors duration-200 select-none touch-manipulation",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "size-5 transition-colors",
                  active ? "text-primary" : "",
                )}
                strokeWidth={active ? 2.5 : 2}
                aria-hidden="true"
              />
              <span className="text-xs font-medium leading-none">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
