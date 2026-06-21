"use client";

import React, { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/use-user";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { 
  Settings, 
  Globe, 
  BookOpen, 
  LogOut, 
  LogIn,
  ChevronRight, 
  ExternalLink, 
  Check, 
  ArrowLeft,
  Sparkles,
  User,
  Gift
} from "lucide-react";
import { cn } from "@/lib/utils";

// 轻量级 i18n 翻译字典
const translations = {
  "zh-CN": {
    title: "账户菜单",
    freePlan: "免费版",
    proPlan: "专业版",
    enterprisePlan: "企业版",
    freeBadge: "免费",
    proBadge: "专业",
    enterpriseBadge: "企业",
    upgradeBtn: "升级套餐",
    pointsText: "积分",
    subPoints: "订阅积分",
    dailyPoints: "每日奖励积分",
    profile: "账户设置",
    rewards: "推荐奖励",
    language: "语言",
    docs: "文档",
    logout: "退出登录",
    login: "登录",
    back: "返回",
    currentPlan: "当前套餐",
  },
  "en-US": {
    title: "Account Menu",
    freePlan: "Free Plan",
    proPlan: "Pro Plan",
    enterprisePlan: "Enterprise Plan",
    freeBadge: "Free",
    proBadge: "Pro",
    enterpriseBadge: "Enterprise",
    upgradeBtn: "Upgrade Plan",
    pointsText: "Points",
    subPoints: "Sub. Points",
    dailyPoints: "Daily Reward",
    profile: "Account Profile",
    rewards: "Rewards",
    language: "Language",
    docs: "Documentation",
    logout: "Log Out",
    login: "Log In",
    back: "Back",
    currentPlan: "Current Plan",
  },
  "zh-TW": {
    title: "帳戶選單",
    freePlan: "免費版",
    proPlan: "專業版",
    enterprisePlan: "企業版",
    freeBadge: "免費",
    proBadge: "專業",
    enterpriseBadge: "企業",
    upgradeBtn: "升級套餐",
    pointsText: "積分",
    subPoints: "訂閱積分",
    dailyPoints: "每日獎勵積分",
    profile: "帳戶設定",
    rewards: "推薦獎勵",
    language: "語言",
    docs: "文檔",
    logout: "登出",
    login: "登入",
    back: "返回",
    currentPlan: "當前套餐",
  }
};

type LangType = "zh-CN" | "en-US" | "zh-TW";

export function AccountMenu() {
  const { data: session } = useSession();
  const router = useRouter();
  
  // Zustand 全局状态
  const { points, subscriptionPoints, dailyRewardPoints, maxDailyRewardPoints, plan } = useUser();

  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activePanel, setActivePanel] = useState<"main" | "lang">("main");
  const [currentLang, setCurrentLang] = useState<LangType>("zh-CN");
  const [menuOpen, setMenuOpen] = useState(false);

  // 1. Hydration 保护与移动端屏幕检测
  useEffect(() => {
    setMounted(true);
    
    // 获取语言设置
    const savedLang = localStorage.getItem("lang") as LangType;
    if (savedLang && translations[savedLang]) {
      setCurrentLang(savedLang);
    }

    const checkScreen = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkScreen();
    window.addEventListener("resize", checkScreen);
    return () => window.removeEventListener("resize", checkScreen);
  }, []);

  // 2. 语言切换动作
  const handleLangChange = (lang: LangType) => {
    setCurrentLang(lang);
    localStorage.setItem("lang", lang);
    // 写入 Cookie 供服务端可能的多语言路由识别
    document.cookie = `lang=${lang};path=/;max-age=31536000`;
    router.refresh();
  };

  if (!mounted) {
    return (
      <div className="size-8 rounded-full bg-[#171717] border border-[#262626] animate-pulse" />
    );
  }

  const t = translations[currentLang] || translations["zh-CN"];
  const userEmail = session?.user?.email || "guest@hermesclaw.ai";
  
  // 积分计算进度百分比 (最高 100%)
  const totalPointsLimit = subscriptionPoints + 100;
  const progressPercent = Math.min(100, Math.round((points / totalPointsLimit) * 100));

  // 获取套餐名称和徽章
  const getPlanInfo = () => {
    switch (plan) {
      case "pro":
        return { name: t.proPlan, badge: t.proBadge, color: "text-[#6D5EF9] bg-[#6D5EF9]/10 border-[#6D5EF9]/20" };
      case "enterprise":
        return { name: t.enterprisePlan, badge: t.enterpriseBadge, color: "text-amber-500 bg-amber-500/10 border-amber-500/20" };
      default:
        return { name: t.freePlan, badge: t.freeBadge, color: "text-[#B3B3B3] bg-[#262626] border-[#333333]" };
    }
  };

  const planInfo = getPlanInfo();

  // 统一的菜单渲染内容 (内部二级切换)
  const renderMenuContent = (closeMenu: () => void) => {
    if (activePanel === "lang") {
      return (
        <div className="space-y-3.5">
          {/* 返回头部 */}
          <button
            onClick={() => setActivePanel("main")}
            className="flex items-center gap-1.5 text-xs text-[#B3B3B3] hover:text-[#F5F5F5] transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            {t.back}
          </button>
          <div className="text-xs font-semibold text-[#B3B3B3] select-none pl-1">
            {t.language}
          </div>
          
          {/* 语言选项 */}
          <div className="space-y-1">
            {(["zh-CN", "en-US", "zh-TW"] as LangType[]).map((langKey) => (
              <button
                key={langKey}
                onClick={() => handleLangChange(langKey)}
                className="w-full h-9 flex items-center justify-between px-2.5 rounded-lg text-sm transition-colors text-[#F5F5F5] hover:bg-[#1F1F1F] cursor-pointer"
              >
                <span>
                  {langKey === "zh-CN" ? "简体中文" : langKey === "en-US" ? "English" : "繁體中文"}
                </span>
                {currentLang === langKey && (
                  <Check className="size-4 text-[#6D5EF9]" />
                )}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3.5">
        {/* 顶部用户信息区 */}
        <div className="flex flex-col gap-1 pl-1">
          <div className="text-[#F5F5F5] text-sm font-semibold truncate select-all max-w-[210px]">
            {userEmail}
          </div>
          <div>
            <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-[6px] text-[10px] font-semibold border leading-none select-none", planInfo.color)}>
              {planInfo.badge}
            </span>
          </div>
        </div>

        <div className="h-px bg-[#262626] -mx-4" />

        {/* 积分状态区 */}
        <div className="space-y-2.5 px-1">
          <div className="flex justify-between items-center text-xs">
            <span className="flex items-center gap-1 text-[#F5F5F5] font-semibold">
              <Sparkles className="size-3.5 text-[#6D5EF9] fill-[#6D5EF9]" />
              {planInfo.name}
            </span>
            <span className="text-[#B3B3B3]">
              <strong className="text-[#F5F5F5] font-bold">{points}</strong> {t.pointsText}
            </span>
          </div>

          {/* 积分进度条 */}
          <div className="w-full h-1 bg-[#262626] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#6D5EF9] rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* 积分明细 */}
          <div className="text-[11px] text-[#B3B3B3] leading-normal space-y-0.5 pl-0.5 select-none">
            <div className="flex items-center gap-1.5">
              <span className="size-1 bg-[#B3B3B3]/40 rounded-full" />
              <span>{t.subPoints}: {subscriptionPoints}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-1 bg-[#B3B3B3]/40 rounded-full" />
              <span>{t.dailyPoints}: {dailyRewardPoints}/{maxDailyRewardPoints}</span>
            </div>
          </div>

          {/* 升级套餐按钮 */}
          <button
            onClick={() => {
              closeMenu();
              router.push("/billing/plans");
            }}
            className="w-full h-9 mt-1 bg-[#1F1F1F] text-[#F5F5F5] border border-[#262626] hover:bg-[#2A2A2A] transition-colors rounded-[12px] text-xs font-semibold flex items-center justify-center cursor-pointer"
          >
            {t.upgradeBtn}
          </button>
        </div>

        <div className="h-px bg-[#262626] -mx-4" />

        {/* 菜单项 */}
        <div className="space-y-0.5">
          {/* 账户设置 */}
          <button
            onClick={() => {
              closeMenu();
              router.push("/settings/profile");
            }}
            className="w-full h-9 flex items-center gap-2.5 px-2 rounded-lg text-sm text-[#F5F5F5] hover:bg-[#1F1F1F] transition-colors cursor-pointer"
          >
            <Settings className="size-4 text-[#B3B3B3]" />
            <span className="flex-1 text-left">{t.profile}</span>
          </button>

          {/* 推荐奖励 */}
          <button
            onClick={() => {
              closeMenu();
              router.push("/rewards");
            }}
            className="w-full h-9 flex items-center gap-2.5 px-2 rounded-lg text-sm text-[#F5F5F5] hover:bg-[#1F1F1F] transition-colors cursor-pointer"
          >
            <Gift className="size-4 text-[#B3B3B3]" />
            <span className="flex-1 text-left">{t.rewards}</span>
          </button>

          {/* 语言 */}
          <button
            onClick={() => {
              // 切换至二级多语言面板，且不关闭弹窗
              setActivePanel("lang");
            }}
            className="w-full h-9 flex items-center gap-2.5 px-2 rounded-lg text-sm text-[#F5F5F5] hover:bg-[#1F1F1F] transition-colors cursor-pointer"
          >
            <Globe className="size-4 text-[#B3B3B3]" />
            <span className="flex-1 text-left">{t.language}</span>
            <ChevronRight className="size-3.5 text-[#B3B3B3]" />
          </button>

          {/* 文档 */}
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeMenu}
            className="w-full h-9 flex items-center gap-2.5 px-2 rounded-lg text-sm text-[#F5F5F5] hover:bg-[#1F1F1F] transition-colors cursor-pointer"
          >
            <BookOpen className="size-4 text-[#B3B3B3]" />
            <span className="flex-1 text-left">{t.docs}</span>
            <ExternalLink className="size-3 text-[#B3B3B3]" />
          </a>
        </div>

        <div className="h-px bg-[#262626] -mx-4" />

        {/* 登录与登出 */}
        {session ? (
          <button
            onClick={async () => {
              closeMenu();
              await signOut({ callbackUrl: "/login" });
            }}
            className="w-full h-9 flex items-center gap-2.5 px-2 rounded-lg text-sm text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors cursor-pointer"
          >
            <LogOut className="size-4" />
            <span className="flex-1 text-left font-semibold">{t.logout}</span>
          </button>
        ) : (
          <button
            onClick={() => {
              closeMenu();
              router.push("/login");
            }}
            className="w-full h-9 flex items-center gap-2.5 px-2 rounded-lg text-sm text-[#6D5EF9] hover:bg-[#6D5EF9]/10 transition-colors cursor-pointer"
          >
            <LogIn className="size-4" />
            <span className="flex-1 text-left font-semibold">{t.login}</span>
          </button>
        )}

        <div className="h-px bg-[#262626] -mx-4" />

        {/* 底部尾注当前账户信息 */}
        <div className="text-center text-[10px] text-[#B3B3B3]/40 select-none py-0.5 leading-none">
          {userEmail} ({planInfo.badge})
        </div>
      </div>
    );
  };

  // 触发源组件 (使用 React.forwardRef 并透传 props 与 ref，确保 Base UI 注入的事件和定位 ref 能正确绑定到底层 button)
  const MenuTriggerButton = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<"button">>(
    (props, ref) => (
      <button 
        ref={ref}
        {...props}
        className={cn(
          "flex items-center gap-2 p-1.5 rounded-xl bg-[#111111] hover:bg-[#1F1F1F] transition-all duration-150 outline-none select-none max-w-[180px] cursor-pointer",
          props.className
        )}
      >
        <div className="flex size-7 items-center justify-center rounded-lg bg-[#6D5EF9]/10 text-[#6D5EF9] shrink-0">
          {session?.user?.image ? (
            <img 
              src={session.user.image} 
              alt="User" 
              className="size-full rounded-lg object-cover" 
            />
          ) : (
            <User className="size-3.5" />
          )}
        </div>
        <div className="hidden sm:flex flex-col items-start text-left min-w-0 pr-1 select-none">
          <span className="text-[#F5F5F5] text-xs font-semibold truncate w-full max-w-[110px]">
            {session?.user?.name || userEmail.split("@")[0]}
          </span>
          <span className="text-[#B3B3B3] text-[9px] truncate w-full">
            {planInfo.name}
          </span>
        </div>
      </button>
    )
  );
  MenuTriggerButton.displayName = "MenuTriggerButton";

  // PC 端使用 Popover，移动端使用 Sheet 抽屉
  if (isMobile) {
    return (
      <Sheet open={menuOpen} onOpenChange={(open) => {
        setMenuOpen(open);
        if (!open) setActivePanel("main"); // 关闭时切回主视图
      }}>
        <SheetTrigger render={<MenuTriggerButton />} />
        <SheetContent side="bottom" className="bg-[#111111] border-t border-[#262626] rounded-t-[16px] p-6 max-h-[90vh] overflow-y-auto">
          <SheetHeader className="sr-only">
            <SheetTitle>{t.title}</SheetTitle>
          </SheetHeader>
          <div className="outline-none mt-2">
            {renderMenuContent(() => setMenuOpen(false))}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={menuOpen} onOpenChange={(open) => {
      setMenuOpen(open);
      if (!open) setActivePanel("main"); // 关闭时切回主视图
    }}>
      <PopoverTrigger render={<MenuTriggerButton />} />
      <PopoverContent 
        side="bottom" 
        align="end" 
        sideOffset={6} 
        className="w-[240px] bg-[#111111] border border-[#262626] rounded-[16px] p-4 shadow-xl z-50 origin-top-right transition-transform"
      >
        {renderMenuContent(() => setMenuOpen(false))}
      </PopoverContent>
    </Popover>
  );
}
