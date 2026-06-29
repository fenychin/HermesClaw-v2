"use client";

import React, { useEffect, useState, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useUser } from "@/hooks/use-user";
import {
  X,
  User,
  Settings,
  CreditCard,
  Shield,
  Code,
  Sparkles,
  Building2,
  Users,
  Cpu,
  Plug,
  GitBranch,
  ShieldCheck,
  ScrollText,
  ShieldAlert,
  Palette,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// 个人账户设置项
const ACCOUNT_ITEMS = [
  { label: "个人资料", href: "/settings/profile", icon: User },
  { label: "偏好设置", href: "/settings/preferences", icon: Settings },
  { label: "账户账单", href: "/settings/billing", icon: CreditCard },
  { label: "受保护密钥", href: "/settings/secrets", icon: Shield },
  { label: "API 密钥", href: "/settings/api-keys", icon: Code },
];

// 企业系统设置项
const SYSTEM_ITEMS = [
  { label: "企业信息", href: "/settings/system?section=company", icon: Building2 },
  { label: "团队与权限", href: "/settings/team", icon: Users },
  { label: "模型路由", href: "/settings/system?section=model-routing", icon: Cpu },
  { label: "连接器授权", href: "/settings/system?section=connectors", icon: Plug },
  { label: "Harness 审批", href: "/settings/harness", icon: GitBranch },
  { label: "自动化等级", href: "/settings/automation", icon: ShieldCheck },
  { label: "审计日志", href: "/settings/system?section=audit", icon: ScrollText },
  { label: "AGENTS 规则", href: "/settings/system?section=agents-rules", icon: ShieldAlert },
  { label: "品牌设置", href: "/settings/system?section=brand", icon: Palette },
];

function SettingsSidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const checkIsActive = (href: string) => {
    const url = new URL(href, "http://localhost");
    const itemPathname = url.pathname;
    const itemSection = url.searchParams.get("section");

    if (pathname !== itemPathname) return false;

    if (itemSection) {
      const currentSection = searchParams.get("section") || "company";
      return currentSection === itemSection;
    }

    if (pathname === "/settings/system") {
      const currentSection = searchParams.get("section");
      return !currentSection || currentSection === "company";
    }

    return true;
  };

  return (
    <nav className="space-y-4 overflow-y-auto pr-1 flex-1 min-h-0 select-none">
      {/* 分区 1：个人账户配置 */}
      <div className="space-y-0.5">
        <div className="text-[10px] text-[#B3B3B3]/40 font-semibold px-3 uppercase tracking-wider mb-1.5">
          个人账户配置
        </div>
        {ACCOUNT_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = checkIsActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 h-9 rounded-lg text-xs transition-all relative cursor-pointer",
                isActive
                  ? "bg-[#1F1F1F] text-[#F5F5F5] font-semibold border-l-2 border-l-[#6D5EF9] rounded-l-none"
                  : "text-[#B3B3B3] hover:text-[#F5F5F5] hover:bg-[#1F1F1F]/40"
              )}
            >
              <Icon className={cn("size-3.5", isActive ? "text-[#6D5EF9]" : "text-[#B3B3B3]")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* 分区 2：企业系统设置 */}
      <div className="space-y-0.5">
        <div className="text-[10px] text-[#B3B3B3]/40 font-semibold px-3 uppercase tracking-wider mb-1.5">
          企业系统设置
        </div>
        {SYSTEM_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = checkIsActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 h-9 rounded-lg text-xs transition-all relative cursor-pointer",
                isActive
                  ? "bg-[#1F1F1F] text-[#F5F5F5] font-semibold border-l-2 border-l-[#6D5EF9] rounded-l-none"
                  : "text-[#B3B3B3] hover:text-[#F5F5F5] hover:bg-[#1F1F1F]/40"
              )}
            >
              <Icon className={cn("size-3.5", isActive ? "text-[#6D5EF9]" : "text-[#B3B3B3]")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

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

  const isSettingsPage = pathname.startsWith("/settings");

  // 如果没有挂载，提供骨架屏避免 hydration mismatch
  if (!mounted) {
    return (
      <div className="flex h-screen bg-[#050505] text-[#F5F5F5] font-sans animate-pulse">
        <div className="w-[220px] bg-[#111111] border-r border-[#262626]" />
        <div className="flex-1 bg-[#050505]" />
      </div>
    );
  }

  // 只要不是以 /settings 开头的页面，进行直通渲染，绝不破坏原有页面布局
  if (!isSettingsPage) {
    return <>{children}</>;
  }

  const userEmail = session?.user?.email || "guest@hermesclaw.ai";

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
        <div className="flex flex-col gap-6 flex-1 min-h-0">
          {/* 顶部 Logo 与区域标识 */}
          <div className="flex items-center justify-between px-1 select-none pt-2 shrink-0">
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

          {/* 导航菜单部分 */}
          <Suspense fallback={<div className="text-xs text-hint p-3">加载中...</div>}>
            <SettingsSidebarNav />
          </Suspense>
        </div>

        {/* 底部展示用户邮箱 + 套餐徽章 */}
        <div className="border-t border-[#262626] pt-3 pb-1 flex flex-col gap-1.5 px-1 min-w-0 shrink-0">
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
