"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { PageTransition } from "@/components/common/PageTransition";
import { PageHeader } from "@/components/common/page-header";
import {
  Building2,
  Users,
  Cpu,
  Plug,
  GitBranch,
  ScrollText,
  Palette,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectorsSettings } from "./_components/connectors-settings";
import { EmptyState } from "@/components/common/empty-state";
import { Settings } from "lucide-react";

const NAV_ITEMS = [
  { key: "company", label: "企业信息", icon: Building2 },
  { key: "team", label: "团队与权限", icon: Users, isRoute: true },
  { key: "model-routing", label: "模型路由", icon: Cpu },
  { key: "connectors", label: "连接器授权", icon: Plug },
  { key: "harness", label: "Harness 审批", icon: GitBranch, isRoute: true },
  { key: "audit", label: "审计日志", icon: ScrollText },
  { key: "brand", label: "品牌设置", icon: Palette },
  { key: "billing", label: "账单套餐", icon: CreditCard },
];

function CompanySettings() {
  return (
    <div className="max-w-2xl relative min-h-full pb-20">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">企业信息</h2>
        <p className="text-sm text-muted-foreground mt-1">管理你的企业基本资料与品牌信息</p>
      </div>
      
      <div className="space-y-6 bg-card border border-border rounded-2xl p-6">
        {/* 企业名称 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">企业名称</label>
          <input
            type="text"
            defaultValue="赫尔墨斯外贸科技有限公司"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Logo 上传 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">企业 Logo</label>
          <div className="flex gap-4 items-center">
            <div className="size-16 shrink-0 bg-accent border border-border rounded-xl flex items-center justify-center text-xs text-hint">Logo</div>
            <div className="flex-1 border border-dashed border-border rounded-xl p-4 flex items-center justify-center text-sm text-muted-foreground cursor-pointer hover:bg-accent/50 transition-colors">
              点击或拖拽上传 Logo
            </div>
          </div>
        </div>

        {/* 行业 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">行业</label>
          <select
            defaultValue="foreign-trade"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="foreign-trade">外贸 / 跨境电商</option>
            <option value="manufacturing">制造业</option>
            <option value="tech">科技 / SaaS</option>
          </select>
        </div>

        {/* 规模 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">企业规模</label>
          <select
            defaultValue="20-50"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="1-10">1-10 人</option>
            <option value="10-20">10-20 人</option>
            <option value="20-50">20-50 人</option>
            <option value="50-200">50-200 人</option>
          </select>
        </div>
      </div>

      <div className="sticky bottom-0 bg-background pt-4 pb-4 flex justify-end mt-4">
        <button
          type="button"
          className="bg-primary text-white hover:bg-primary/90 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          保存更改
        </button>
      </div>
    </div>
  );
}

function ModelRoutingSettings() {
  const models = [
    { name: "Claude 3.5 Sonnet", provider: "Anthropic", latency: "低延迟", cost: "中等" },
    { name: "GPT-4o", provider: "OpenAI", latency: "低延迟", cost: "中等" },
    { name: "Gemini 1.5 Pro", provider: "Google", latency: "中延迟", cost: "高" },
  ];

  return (
    <div className="max-w-2xl pb-10">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">模型路由</h2>
        <p className="text-sm text-muted-foreground mt-1">配置默认的 AI 模型及其备用策略</p>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">当前激活模型</h3>
          <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cpu className="size-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-primary">Claude 3.5 Sonnet</p>
                <p className="text-xs text-primary/70">Anthropic</p>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="bg-primary/20 text-primary text-[10px] px-2 py-0.5 rounded-full font-medium">低延迟</span>
              <span className="bg-primary/20 text-primary text-[10px] px-2 py-0.5 rounded-full font-medium">中等费用</span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-foreground mb-3 mt-6">备用模型</h3>
          <div className="space-y-3">
            {models.map((m, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                    <Cpu className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.provider}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <span className="bg-accent text-muted-foreground text-[10px] px-2 py-0.5 rounded-full font-medium">{m.latency}</span>
                  <span className="bg-accent text-muted-foreground text-[10px] px-2 py-0.5 rounded-full font-medium">{m.cost}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = searchParams.get("section") || "company";

  const handleNavClick = (item: typeof NAV_ITEMS[0]) => {
    if (item.isRoute) {
      router.push(`/settings/${item.key}`);
    } else {
      router.push(`${pathname}?section=${item.key}`);
    }
  };

  const renderContent = () => {
    switch (section) {
      case "connectors":
        return <ConnectorsSettings />;
      case "model-routing":
        return <ModelRoutingSettings />;
      case "company":
        return <CompanySettings />;
      default:
        return (
          <div className="flex h-full items-center justify-center py-20">
            <EmptyState
              icon={Settings}
              title="暂未实现"
              description="该模块暂未在基础版中实现"
            />
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full p-6">
      <PageHeader title="设置" description="企业配置、模型路由、连接器授权与系统偏好" />
      <div className="flex flex-1 gap-8 mt-6 min-h-0 overflow-hidden">
        {/* 左侧导航 */}
        <nav className="w-48 shrink-0 space-y-1 overflow-y-auto pr-2 pb-6">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = !item.isRoute && section === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavClick(item)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors text-left",
                  isActive
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 右侧内容 */}
        <div className="flex-1 min-w-0 overflow-y-auto relative px-1 pb-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <PageTransition>
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">加载中…</div>}>
        <SettingsPageContent />
      </Suspense>
    </PageTransition>
  );
}
