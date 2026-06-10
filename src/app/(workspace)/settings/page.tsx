"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { PageTransition } from "@/components/common/PageTransition";
import { PageHeader } from "@/components/common/page-header";
import { useWorkspaceData } from "@/hooks/use-workspace";
import { isAdmin, type WorkspaceRole } from "@/lib/workspace";
import {
  useModelRouting,
  useUpdateModelRouting,
  type TaskType,
  type LlmProvider,
} from "@/hooks/use-model-routing";
import {
  Building2,
  Users,
  Cpu,
  Plug,
  GitBranch,
  ScrollText,
  Palette,
  CreditCard,
  Mic,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectorsSettings } from "./_components/connectors-settings";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { SectionTitle } from "@/components/common/section-title";
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
            className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-hint focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors"
            placeholder="请输入企业名称"
          />
        </div>

        {/* Logo 上传 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">企业 Logo</label>
          <div className="flex gap-4 items-center">
            <div className="size-16 shrink-0 bg-accent border border-border rounded-xl flex items-center justify-center text-xs text-hint">
              Logo
            </div>
            <label className="flex-1 border border-dashed border-border rounded-xl p-4 flex items-center justify-center text-sm text-muted-foreground cursor-pointer hover:bg-accent/50 transition-colors">
              <input type="file" accept="image/*" className="hidden" />
              点击或拖拽上传 Logo
            </label>
          </div>
        </div>

        {/* 行业 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">行业</label>
          <select
            defaultValue="foreign-trade"
            className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors"
          >
            <option value="foreign-trade">外贸 / 跨境电商</option>
            <option value="manufacturing">制造业</option>
            <option value="tech">科技 / SaaS</option>
            <option value="retail">零售 / 消费品</option>
            <option value="logistics">物流 / 供应链</option>
          </select>
        </div>

        {/* 规模 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">企业规模</label>
          <select
            defaultValue="20-50"
            className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors"
          >
            <option value="1-10">1-10 人</option>
            <option value="10-20">10-20 人</option>
            <option value="20-50">20-50 人</option>
            <option value="50-200">50-200 人</option>
            <option value="200+">200+ 人</option>
          </select>
        </div>

        {/* 联系邮箱 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">联系邮箱</label>
          <input
            type="email"
            defaultValue="admin@hermesclaw.com"
            className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-hint focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors"
            placeholder="请输入企业联系邮箱"
          />
        </div>
      </div>

      {/* 保存按钮（disabled + 提示） */}
      <div className="sticky bottom-0 bg-background pt-4 pb-4 flex items-center justify-end gap-3 mt-4">
        <span className="text-xs text-hint flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full bg-warning" />
          保存功能即将上线
        </span>
        <button
          type="button"
          disabled
          className="bg-primary/50 text-white/60 px-5 py-2 rounded-xl text-sm font-medium cursor-not-allowed transition-colors"
        >
          保存更改
        </button>
      </div>
    </div>
  );
}

function BrandSettings() {
  return (
    <div className="max-w-2xl pb-10">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">品牌设置</h2>
        <p className="text-sm text-muted-foreground mt-1">
          管理品牌视觉与声音资产，统一数字员工的对外表达风格
        </p>
      </div>

      <div className="space-y-4">
        {/* 品牌色 */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <SectionTitle
            title="品牌色"
            subtitle="定义主色、辅助色与场景色彩体系"
            action={
              <Badge variant="outline" className="text-hint text-[10px]">
                规划中
              </Badge>
            }
          />
          <div className="mt-4">
            <EmptyState
              icon={Palette}
              title="品牌色配置"
              description="自定义品牌主色、辅助色，一键生成深色/浅色适配方案。该功能将在后续版本中上线。"
            />
          </div>
        </div>

        {/* 品牌声音 */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <SectionTitle
            title="品牌声音"
            subtitle="设定品牌语调、风格与文案模板"
            action={
              <Badge variant="outline" className="text-hint text-[10px]">
                规划中
              </Badge>
            }
          />
          <div className="mt-4">
            <EmptyState
              icon={Mic}
              title="品牌声音配置"
              description="定义品牌语调风格、专业术语库与多语种文案模板，确保 AI 输出的语气与品牌一致。该功能将在后续版本中上线。"
            />
          </div>
        </div>

        {/* 品牌素材 */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <SectionTitle
            title="品牌素材"
            subtitle="管理品牌 Logo、字体、图像与视频模板"
            action={
              <Badge variant="outline" className="text-hint text-[10px]">
                规划中
              </Badge>
            }
          />
          <div className="mt-4">
            <EmptyState
              icon={ImageIcon}
              title="品牌素材管理"
              description="集中管理品牌 Logo、字体、产品图模板、营销素材与视频封面模板。该功能将在后续版本中上线。"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BillingSettings() {
  // Mock 用量数据
  const usageItems = [
    { label: "AI 对话次数", used: 1847, limit: 3000, unit: "次/月" },
    { label: "智能体执行任务", used: 432, limit: 800, unit: "次/月" },
    { label: "记忆存储", used: 2.4, limit: 10, unit: "GB" },
    { label: "连接器调用", used: 1280, limit: 5000, unit: "次/月" },
  ];

  return (
    <div className="max-w-2xl pb-10">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">账单套餐</h2>
        <p className="text-sm text-muted-foreground mt-1">
          查看当前套餐与用量，管理订阅与账单
        </p>
      </div>

      {/* 当前套餐卡片 */}
      <div className="bg-card border border-brand/20 rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-brand/10 flex items-center justify-center">
              <CreditCard className="size-5 text-brand" />
            </div>
            <div>
              <p className="text-foreground text-sm font-semibold">专业版</p>
              <p className="text-muted-foreground text-xs">¥299 / 月 · 3 个席位</p>
            </div>
          </div>
          <Badge className="bg-success/10 text-success text-[10px]">当前套餐</Badge>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          包含基础 AI 对话、外贸行业技能、5 个智能体席位、50 条/月记忆存储。适合小型外贸团队日常使用。
        </p>
      </div>

      {/* 用量明细 */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-sm font-semibold">用量明细</h3>
          <span className="text-muted-foreground text-xs">
            结算周期：{(() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), now.getMonth(), 1);
              const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
              const fmt = (d: Date) =>
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              return `${fmt(start)} ~ ${fmt(end)}`;
            })()}
          </span>
        </div>

        {usageItems.map((item) => {
          const pct = Math.min((item.used / item.limit) * 100, 100);
          const isNearLimit = pct >= 80;
          const isOverLimit = pct >= 100;

          return (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">{item.label}</span>
                <span className="text-xs text-muted-foreground">
                  {item.used.toLocaleString("zh-CN")} / {item.limit.toLocaleString("zh-CN")}{" "}
                  {item.unit}
                </span>
              </div>
              <div className="h-2 bg-accent rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    isOverLimit
                      ? "bg-danger"
                      : isNearLimit
                        ? "bg-warning"
                        : "bg-brand",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部提示 */}
      <div className="mt-5 bg-accent/50 border border-border rounded-xl p-4 flex items-center gap-3">
        <div className="size-9 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
          <span className="text-warning text-sm">⏳</span>
        </div>
        <div>
          <p className="text-foreground text-sm font-medium">账单系统即将上线</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            套餐升级、发票管理、支付方式等功能正在开发中，届时将通过站内信通知。
          </p>
        </div>
      </div>
    </div>
  );
}

// 可选默认模型清单（与 model-router 常量保持一致）
const MODEL_OPTIONS: { value: string; label: string; provider: string }[] = [
  { value: "deepseek-chat", label: "DeepSeek Chat", provider: "DeepSeek（成本优化）" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "Anthropic（高能力）" },
];

// taskType 列表与中文标签
const TASK_TYPE_ITEMS: { key: TaskType; label: string; hint: string }[] = [
  { key: "chat", label: "对话（chat）", hint: "Hermes 控制面实时对话" },
  { key: "workflow", label: "工作流（workflow）", hint: "DAG 任务编排（默认成本优化）" },
  { key: "analysis", label: "分析（analysis）", hint: "数据 / 询盘分析" },
  { key: "generation", label: "生成（generation）", hint: "文案 / 素材生成" },
];

// Provider 下拉选项（空值 = 跟随默认模型自动推断）
const PROVIDER_OPTIONS: { value: "" | LlmProvider; label: string }[] = [
  { value: "", label: "自动（跟随默认模型）" },
  { value: "anthropic", label: "Anthropic" },
  { value: "deepseek", label: "DeepSeek" },
];

function ModelRoutingSettings() {
  const { data: session } = useSession();
  const { members } = useWorkspaceData();
  const { settings, isLoading } = useModelRouting();
  const updateMutation = useUpdateModelRouting();

  // 当前用户角色——经 session email 匹配成员列表，仅 ADMIN/OWNER 可改
  const currentRole: WorkspaceRole =
    (members.find((m) => m.email === session?.user?.email)?.role as WorkspaceRole) ?? "VIEWER";
  const canManage = isAdmin(currentRole);

  // 本地表单态（首次服务端配置到达时初始化，后续由用户编辑驱动）
  const [defaultModel, setDefaultModel] = useState("deepseek-chat");
  const [taskProviderMap, setTaskProviderMap] = useState<
    Partial<Record<TaskType, LlmProvider>>
  >({});
  const initialized = useRef(false);

  useEffect(() => {
    if (settings && !initialized.current) {
      initialized.current = true;
      setDefaultModel(settings.defaultModel);
      setTaskProviderMap(settings.taskProviderMap ?? {});
    }
  }, [settings]);

  const handleProviderChange = (task: TaskType, value: string) => {
    setTaskProviderMap((prev) => {
      const next = { ...prev };
      if (value === "") {
        delete next[task];
      } else {
        next[task] = value as LlmProvider;
      }
      return next;
    });
  };

  const handleSave = () => {
    updateMutation.mutate(
      { defaultModel, taskProviderMap },
      {
        onSuccess: () => toast.success("模型路由配置已保存"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "保存失败"),
      },
    );
  };

  return (
    <div className="max-w-2xl pb-10">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">模型路由</h2>
        <p className="text-sm text-muted-foreground mt-1">
          配置默认模型与各任务类型的 Provider 偏好。高风险任务始终路由至高能力模型。
        </p>
      </div>

      {/* 路由规则说明 */}
      <div className="mb-6 bg-card border border-border rounded-xl p-4 text-xs text-muted-foreground space-y-1.5">
        <p className="flex items-center gap-2">
          <span className="text-danger font-medium">高风险</span>
          → claude-sonnet-4-6（高能力模型，不可在此关闭）
        </p>
        <p className="flex items-center gap-2">
          <span className="text-warning font-medium">工作流</span>
          → deepseek-chat（成本优化，非高风险时）
        </p>
        <p className="flex items-center gap-2">
          <span className="text-success font-medium">其余</span>
          → 下方默认模型与 Provider 偏好
        </p>
      </div>

      {!canManage && (
        <div className="mb-4 bg-warning/10 border border-warning/30 rounded-xl p-3 text-xs text-warning">
          仅管理员（OWNER / ADMIN）可修改模型路由，当前为只读视图。
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8">加载配置中…</div>
      ) : (
        <div className="space-y-6">
          {/* 默认模型 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">默认模型</label>
            <p className="text-xs text-muted-foreground">未命中高风险 / 工作流规则时使用</p>
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              disabled={!canManage}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label} — {m.provider}
                </option>
              ))}
            </select>
          </div>

          {/* 各 taskType Provider 偏好 */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">任务类型 Provider 偏好</h3>
            {TASK_TYPE_ITEMS.map((item) => (
              <div
                key={item.key}
                className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                    <Cpu className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.hint}</p>
                  </div>
                </div>
                <select
                  value={taskProviderMap[item.key] ?? ""}
                  onChange={(e) => handleProviderChange(item.key, e.target.value)}
                  disabled={!canManage}
                  className="shrink-0 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {PROVIDER_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {canManage && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="bg-primary text-white hover:bg-primary/90 px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateMutation.isPending ? "保存中…" : "保存更改"}
              </button>
            </div>
          )}
        </div>
      )}
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
      case "brand":
        return <BrandSettings />;
      case "billing":
        return <BillingSettings />;
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
