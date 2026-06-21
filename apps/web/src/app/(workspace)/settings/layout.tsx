"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useUser } from "@/hooks/use-user";
import { X, User, Settings, CreditCard, Shield, Code, Sparkles, Server } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "个人资料", href: "/settings/profile", icon: User },
  { label: "设置", href: "/settings/preferences", icon: Settings },
  { label: "账单", href: "/settings/billing", icon: CreditCard },
  { label: "密钥", href: "/settings/secrets", icon: Shield },
  { label: "API 密钥", href: "/settings/api-keys", icon: Code },
];

/** 系统级设置独立入口 */
const SYSTEM_ENTRY = { label: "系统设置", href: "/settings/system", icon: Server };

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { plan } = useUser();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 判定是否是新版的账户设置中心子页面 (包含 billing)
  const isAuthSettingsPage = NAV_ITEMS.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  ) || pathname === "/settings/security"; // 包含安全子页

  // 系统设置页走 workspace 主布局，不使用个人设置中心的双栏框架
  const isSystemSettingsPage = pathname === SYSTEM_ENTRY.href || pathname.startsWith(SYSTEM_ENTRY.href);

  // 如果没有挂载，提供骨架屏避免 hydration mismatch
  if (!mounted) {
    return (
      <div className="flex h-screen bg-[#050505] text-[#F5F5F5] font-sans animate-pulse">
        <div className="w-[220px] bg-[#111111] border-r border-[#262626]" />
        <div className="flex-1 bg-[#050505]" />
      </div>
    );
  }

  // 如果是不在配置项内的老配置页面，则进行直通渲染，绝不破坏原有页面
  if (!isAuthSettingsPage || isSystemSettingsPage) {
    return <>{children}</>;
  }

  const userEmail = session?.user?.email || "guest@hermesclaw.ai";

  // 根据 Zustand 中的套餐状态进行徽章渲染
  const getBadgeStyle = () => {
    switch (plan) {
      case "pro":
        return { text: "专业", style: "text-[#6D5EF9] bg-[#6D5EF9]/10 border-[#6D5EF9]/20" };
      case "enterprise":
        return { text: "企业", style: "text-amber-500 bg-amber-500/10 border-amber-500/20" };
      default:
        return { text: "免费", style: "text-[#B3B3B3] bg-[#262626] border-[#333333]" };
    }
  };

  const badge = getBadgeStyle();

  return (
    <div className="flex h-screen bg-[#050505] text-[#F5F5F5] font-sans select-none overflow-hidden relative">
      {/* 左侧导航栏 (宽 220px, bg #111111, border-r #262626) */}
      <div className="w-[220px] bg-[#111111] border-r border-[#262626] flex flex-col justify-between p-4 shrink-0 relative">
        <div className="space-y-6">
          {/* 顶部 Logo 与区域标识 */}
          <div className="flex items-center justify-between px-1 select-none pt-2">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#6D5EF9] to-[#4da3ff] shadow-md shadow-[#6D5EF9]/10 shrink-0">
                <svg
                  className="size-3.5 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="text-[#F5F5F5] text-sm font-bold tracking-wide">
                设置中心
              </span>
            </div>
            {/* 关闭按钮 (X，右上角) */}
            <button
              onClick={() => router.push("/workspace/chat")}
              className="flex size-6 items-center justify-center rounded-md border border-[#262626] bg-[#171717] text-[#B3B3B3] hover:text-[#F5F5F5] hover:border-[#333333] transition-all duration-200 shadow-sm cursor-pointer group"
              title="关闭设置"
            >
              <X className="size-3 group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </div>

          {/* 导航菜单 */}
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              // 特殊处理安全子页，使其挂载在“个人资料”或“设置”之下
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 h-10 rounded-lg text-sm transition-all relative cursor-pointer",
                    isActive
                      ? "bg-[#1F1F1F] text-[#F5F5F5] font-semibold border-l-2 border-l-[#6D5EF9] rounded-l-none"
                      : "text-[#B3B3B3] hover:text-[#F5F5F5] hover:bg-[#1F1F1F]/40"
                  )}
                >
                  <Icon className={cn("size-4", isActive ? "text-[#6D5EF9]" : "text-[#B3B3B3]")} />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* 分隔线 */}
            <div className="h-px bg-[#1F1F1F] mx-1 my-2" />

            {/* 系统设置独立入口 */}
            {(() => {
              const SysIcon = SYSTEM_ENTRY.icon;
              const isSystemActive = pathname === SYSTEM_ENTRY.href || pathname.startsWith(SYSTEM_ENTRY.href);
              return (
                <Link
                  href={SYSTEM_ENTRY.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 h-10 rounded-lg text-sm transition-all relative cursor-pointer",
                    isSystemActive
                      ? "bg-[#1F1F1F] text-[#F5F5F5] font-semibold border-l-2 border-l-[#6D5EF9] rounded-l-none"
                      : "text-[#B3B3B3] hover:text-[#F5F5F5] hover:bg-[#1F1F1F]/40"
                  )}
                >
                  <SysIcon className={cn("size-4", isSystemActive ? "text-[#6D5EF9]" : "text-[#B3B3B3]")} />
                  <span>{SYSTEM_ENTRY.label}</span>
                </Link>
              );
            })()}
          </nav>
        </div>

        {/* 底部展示用户邮箱 + 套餐徽章 */}
        <div className="border-t border-[#262626] pt-3 pb-1 flex flex-col gap-1.5 px-1 min-w-0">
          <div className="text-xs text-[#B3B3B3] truncate select-all" title={userEmail}>
            {userEmail}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[9px] font-semibold border leading-none select-none", badge.style)}>
              {badge.text}
            </span>
            {plan !== "free" && (
              <Sparkles className="size-3 text-[#6D5EF9] fill-[#6D5EF9]" />
            )}
          </div>
        </div>
      </div>

      {/* 右侧内容区 (bg #050505, flex-1) */}
      <div className="flex-1 bg-[#050505] flex flex-col relative h-full">


        {/* 主内容载体 (max-w 900px, 居中) */}
        <div className="flex-1 overflow-y-auto px-8 py-12 md:px-16 lg:px-24">
          <div className="max-w-[900px] w-full mx-auto min-h-full pb-12">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
