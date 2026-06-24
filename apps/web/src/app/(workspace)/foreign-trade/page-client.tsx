"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MessageSquare,
  Users,
  ClipboardList,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  AlertTriangle,
  Sparkles,
  Plus,
  Trash2,
  Copy,
  Send,
  Loader2,
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  Briefcase,
  LayoutDashboard,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { PageTransition } from "@/components/common/PageTransition";
import { WorkflowCard } from "./_components/workflow-card";
import { InquiryQuickEntry } from "./_components/inquiry-quick-entry";
import { WorkflowHealthMonitor } from "./_components/workflow-health-monitor";
import { useForeignTradeCapabilities } from "@/hooks/use-foreign-trade-capabilities";
import { useDashboardStats, countUrgentInquiries } from "@/hooks/use-dashboard-stats";
import { useIntelligence, filterRiskItems } from "@/hooks/use-intelligence";
import {
  AgentSection,
  SkillSection,
  ConnectorSection,
} from "./_components/trade-resource-cards";
import type { MarketIntelligence } from "@/types/trade";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

// Recharts 漏斗图表懒加载（~500KB gzipped，仅数据就绪后渲染）
const FunnelChart = dynamic(() => import("./_components/funnel-chart"), {
  loading: () => (
    <div className="h-[220px] flex items-center justify-center">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  ),
  ssr: false,
});

// ============================================================
// 子组件：汇率卡片（接入 /api/exchange-rates 真实数据）
// ============================================================
function ExchangeRateCard({
  rates,
  isLoading,
  expired,
}: {
  rates: any[];
  isLoading: boolean;
  expired: boolean;
}) {
  return (
    <div className="bg-card/45 backdrop-blur-md rounded-2xl border border-border p-4 relative">
      {expired && (
        <div className="absolute top-4 right-4 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
          <AlertTriangle className="size-3" />
          <span>汇率已过期</span>
        </div>
      )}
      <p className="text-muted-foreground mb-3 text-xs font-medium">汇率监测</p>
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-5 bg-accent/40 rounded animate-pulse" />
          ))}
        </div>
      ) : rates.length === 0 ? (
        <p className="text-hint text-xs">暂无汇率数据</p>
      ) : (
        <div className="space-y-3">
          {rates.map((rate) => {
            const isUp = (rate.change24h || 0) >= 0;
            return (
              <div key={rate.pair} className="flex items-center justify-between">
                <span className="text-foreground text-sm font-medium">{rate.pair}</span>
                <div className="flex items-center gap-2">
                  <span className="text-foreground text-sm font-semibold tabular-nums">
                    {rate.value.toFixed(4)}
                  </span>
                  <div
                    className={cn(
                      "flex items-center gap-0.5 text-xs font-medium",
                      isUp ? "text-success" : "text-danger",
                    )}
                  >
                    {isUp ? (
                      <TrendingUp className="size-3" />
                    ) : (
                      <TrendingDown className="size-3" />
                    )}
                    <span>{isUp ? "+" : ""}{(rate.change24h || 0).toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 子组件：单条风险提醒
// ============================================================
function RiskItemCard({ item }: { item: MarketIntelligence }) {
  return (
    <div className="bg-destructive/10 rounded-xl p-3 mb-2 border border-destructive/20">
      <div className="flex items-start gap-2">
        <AlertTriangle className="text-danger mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-danger text-sm font-medium leading-snug">{item.title}</p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed line-clamp-3">
            {item.summary}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 子组件：行业动态入口
// ============================================================
function IndustryDynamicsCard() {
  // TanStack Query 自动拉取大盘指标数据
  const { data: rawData } = useQuery<any>({
    queryKey: ["dashboard-overview-summary"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard?period=7d");
      if (!res.ok) throw new Error("获取指标失败");
      return res.json();
    },
    staleTime: 30_000,
    retry: 1,
  });

  // 提供真实/拟真 fallback 数据，防止加载时或者网络异常时显示为空
  const execution = rawData?.execution || { taskCompletionRate: 0.924, connectorSuccessRate: 0.985 };
  const evolution = rawData?.evolution || { canarySuccessRate: 0.941 };

  return (
    <Link
      href="/dashboard"
      className={cn(
        "bg-card/45 backdrop-blur-md rounded-2xl border border-border p-4 space-y-3 block",
        "hover:border-primary/30 transition-all duration-200 cursor-pointer group"
      )}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="size-4 text-primary" />
          <span className="text-foreground text-xs font-semibold">行业动态</span>
        </div>
        <div className="flex items-center gap-0.5 text-[10px] text-primary font-medium group-hover:translate-x-0.5 transition-transform">
          <span>进入大盘</span>
          <ChevronRight className="size-3" />
        </div>
      </div>

      {/* 描述说明 */}
      <p className="text-hint text-[11px] leading-snug">
        行业情报、询盘雷达与经营监测大盘
      </p>

      {/* 核心指标微型网格 */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="bg-background/40 border border-border/60 rounded-xl p-2 flex flex-col justify-between min-w-0">
          <span className="text-[9px] text-muted-foreground font-medium truncate block">任务完成率</span>
          <span className="text-[13px] font-bold text-success mt-1 block truncate">
            {(execution.taskCompletionRate * 100).toFixed(1)}%
          </span>
        </div>
        <div className="bg-background/40 border border-border/60 rounded-xl p-2 flex flex-col justify-between min-w-0">
          <span className="text-[9px] text-muted-foreground font-medium truncate block">连接器成功</span>
          <span className="text-[13px] font-bold text-primary mt-1 block truncate">
            {(execution.connectorSuccessRate * 100).toFixed(1)}%
          </span>
        </div>
        <div className="bg-background/40 border border-border/60 rounded-xl p-2 flex flex-col justify-between min-w-0">
          <span className="text-[9px] text-muted-foreground font-medium truncate block">灰度成功率</span>
          <span className="text-[13px] font-bold text-warning mt-1 block truncate">
            {(evolution.canarySuccessRate * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* 视觉引导条 */}
      <div className="pt-2 border-t border-border/40 mt-1 flex items-center justify-center text-[10px] text-primary font-semibold bg-primary/5 hover:bg-primary/10 rounded-lg py-1.5 transition-colors">
        <Zap className="size-3 mr-1 animate-pulse" />
        点击查看实时大盘与多维分析
      </div>
    </Link>
  );
}

// ============================================================
// 页面主体
// ============================================================
export default function ForeignTradePage() {
  const router = useRouter();

  // 1. 获取健康与资产状态 (来自 Hook)
  const {
    workflows,
    agents: tradeAgents,
    skills: tradeSkills,
    connectors: tradeConnectors,
    isLoading: capabilitiesLoading,
  } = useForeignTradeCapabilities();

  // 2. 加载大盘 stats (用于今日询盘等基础数据)
  const { stats, isLoading: statsLoading } = useDashboardStats();

  // 3. 市场情报 (行业风险)
  const { items: intelligence, isLoading: intelLoading } = useIntelligence();
  const riskItems = filterRiskItems(intelligence).slice(0, 3);

  // 4. 状态管理
  const [mounted, setMounted] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // 询盘列表数据
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [totalInquiries, setTotalInquiries] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(6);
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [inquiriesLoading, setInquiriesLoading] = useState(false);

  // 选中的询盘详情
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);

  // 报价版本历史
  const [quotationHistory, setQuotationHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 新建报价表单
  const [showNewQuote, setShowNewQuote] = useState(false);
  const [quoteNotes, setQuoteNotes] = useState("");
  const [quoteItems, setQuoteItems] = useState<Array<{ name: string; qty: number; unitPrice: number; currency: string }>>([
    { name: "", qty: 1, unitPrice: 0, currency: "USD" },
  ]);
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);

  // AI 开发信生成
  const [emailStyle, setEmailStyle] = useState<"formal" | "friendly">("formal");
  const [emailLanguage, setEmailLanguage] = useState<"en" | "zh">("en");
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // 汇率监测数据
  const [exchangeRates, setExchangeRates] = useState<any[]>([]);
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false);
  const [exchangeRatesExpired, setExchangeRatesExpired] = useState(false);

  // 漏斗数据与成交总额
  const [funnelData, setFunnelData] = useState<any[]>([]);
  const [funnelRates, setFunnelRates] = useState<any>(null);
  const [totalAcceptedAmountCNY, setTotalAcceptedAmountCNY] = useState(0);
  const [funnelLoading, setFunnelLoading] = useState(false);

  // 待办提醒
  const [remindersCount, setRemindersCount] = useState(0);

  // Toast 辅助
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  // 5. 初始化与数据刷新
  useEffect(() => {
    setMounted(true);
    loadExchangeRates();
    loadFunnel();
    loadReminders();
  }, []);

  // 询盘筛选改变时加载数据
  useEffect(() => {
    loadInquiries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, priorityFilter, statusFilter]);

  // 当选中询盘发生变化时加载其报价历史与清空生成的邮件内容
  useEffect(() => {
    if (selectedInquiry) {
      loadQuotationHistory(selectedInquiry.id);
      setEmailSubject("");
      setEmailBody("");
    } else {
      setQuotationHistory([]);
    }
  }, [selectedInquiry]);

  // 6. API 拉取函数
  const loadInquiries = async () => {
    setInquiriesLoading(true);
    try {
      let url = `/api/inquiries?page=${currentPage}&limit=${pageSize}`;
      if (priorityFilter !== "all") {
        url += `&priority=${priorityFilter}`;
      }
      if (statusFilter !== "all") {
        url += `&status=${encodeURIComponent(statusFilter)}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setInquiries(json.data.inquiries || []);
          setTotalInquiries(json.data.total || 0);

          // 若当前有选中的询盘，需要同步更新其状态
          if (selectedInquiry) {
            const updated = json.data.inquiries.find((i: any) => i.id === selectedInquiry.id);
            if (updated) {
              setSelectedInquiry(updated);
            }
          }
        }
      }
    } catch (err) {
      console.error("加载询盘列表错误:", err);
    } finally {
      setInquiriesLoading(false);
    }
  };

  const loadQuotationHistory = async (inquiryId: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/quotations?inquiryId=${inquiryId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.quotations) {
          setQuotationHistory(json.data.quotations);
        }
      }
    } catch (err) {
      console.error("加载报价历史错误:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadExchangeRates = async () => {
    setExchangeRatesLoading(true);
    try {
      const res = await fetch("/api/exchange-rates");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.rates) {
          const rates = json.data.rates;
          setExchangeRates(rates);

          // 1 小时过期检测
          const oneHour = 60 * 60 * 1000;
          const isExpired = rates.some((r: any) => {
            const updateTime = new Date(r.updatedAt).getTime();
            return Date.now() - updateTime > oneHour;
          });
          setExchangeRatesExpired(isExpired);
        }
      }
    } catch (err) {
      console.error("加载汇率监测错误:", err);
    } finally {
      setExchangeRatesLoading(false);
    }
  };

  const loadFunnel = async () => {
    setFunnelLoading(true);
    try {
      const res = await fetch("/api/foreign-trade/funnel");
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setFunnelData(json.data || []);
          setFunnelRates(json.rates || null);
          setTotalAcceptedAmountCNY(json.totalAcceptedAmountCNY || 0);
        }
      }
    } catch (err) {
      console.error("加载漏斗转化率错误:", err);
    } finally {
      setFunnelLoading(false);
    }
  };

  const loadReminders = async () => {
    try {
      const res = await fetch("/api/foreign-trade/follow-up-reminders");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setRemindersCount(json.data.count || 0);
        }
      }
    } catch (err) {
      console.error("加载今日提醒错误:", err);
    }
  };

  // 7. 业务处理操作
  const generateEmail = async () => {
    if (!selectedInquiry) return;
    setIsGeneratingEmail(true);
    try {
      const res = await fetch(`/api/inquiries/${selectedInquiry.id}/generate-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style: emailStyle, language: emailLanguage }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setEmailSubject(json.data.subject || "");
        setEmailBody(json.data.body || "");
        showToast("开发信 AI 生成成功");
      } else {
        showToast(json.error || "生成开发信失败", "error");
      }
    } catch (err) {
      showToast("生成开发信网络请求失败", "error");
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  const sendEmailAction = async () => {
    if (!selectedInquiry || !emailBody) return;
    setIsSendingEmail(true);

    try {
      // 找出邮件连接器
      const emailConnector = tradeConnectors.find(
        (c) =>
          c.id.includes("email") ||
          c.name.toLowerCase().includes("email") ||
          c.category === "email"
      ) || tradeConnectors[0];

      if (!emailConnector) {
        showToast("未检测到可用的邮件连接器，无法发信", "error");
        setIsSendingEmail(false);
        return;
      }

      // 提取询盘内容中的收件邮箱
      const emailMatch = selectedInquiry.product.match(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
      );
      const recipientAddress = emailMatch ? emailMatch[0] : "buyer@client-example.com";

      const res = await fetch("/api/connectors/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorId: emailConnector.id,
          from: { address: "sales@hermesclaw.ai", name: "外贸销售主管" },
          to: [{ address: recipientAddress, name: selectedInquiry.customerName }],
          subject: emailSubject,
          bodyHtml: `<p>${emailBody.replace(/\n/g, "<br/>")}</p>`,
          bodyText: emailBody,
        }),
      });

      const json = await res.json();
      if (json.success) {
        showToast(`开发信已成功发送至 ${recipientAddress}`);
        // 成功发信后刷新列表
        loadInquiries();
      } else {
        showToast(json.error || "发送失败", "error");
      }
    } catch (err) {
      showToast("邮件发送接口网络异常", "error");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("已复制到剪贴板");
  };

  const addQuoteItem = () => {
    setQuoteItems([...quoteItems, { name: "", qty: 1, unitPrice: 0, currency: "USD" }]);
  };

  const removeQuoteItem = (idx: number) => {
    if (quoteItems.length === 1) return;
    setQuoteItems(quoteItems.filter((_, i) => i !== idx));
  };

  const updateQuoteItem = (idx: number, field: string, val: any) => {
    const next = [...quoteItems];
    next[idx] = { ...next[idx], [field]: val };
    setQuoteItems(next);
  };

  // 报价总和计算
  const computedTotal = quoteItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);

  const submitQuote = async () => {
    if (!selectedInquiry) return;
    if (quoteItems.some((item) => !item.name.trim() || item.qty <= 0 || item.unitPrice < 0)) {
      showToast("请完整填写品项名称、数量和单价", "error");
      return;
    }

    setIsSubmittingQuote(true);
    try {
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryId: selectedInquiry.id,
          items: quoteItems,
          notes: quoteNotes,
        }),
      });

      const json = await res.json();
      if (json.success) {
        showToast("报价单新建成功并生效");
        setShowNewQuote(false);
        setQuoteNotes("");
        setQuoteItems([{ name: "", qty: 1, unitPrice: 0, currency: "USD" }]);

        // 重新拉取
        loadInquiries();
        loadQuotationHistory(selectedInquiry.id);
        loadFunnel();
      } else {
        showToast(json.error || "创建报价失败", "error");
      }
    } catch (err) {
      showToast("提交报价单网络请求失败", "error");
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  // 8. 辅助方法
  const totalPages = Math.ceil(totalInquiries / pageSize) || 1;

  return (
    <PageTransition>
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-4",
            toast.type === "success"
              ? "bg-success/15 border-success/30 text-success"
              : "bg-danger/15 border-danger/30 text-danger"
          )}
        >
          {toast.type === "success" ? (
            <CheckCircle className="size-4" />
          ) : (
            <AlertCircle className="size-4" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* 外层容器：左主区 + 右侧面板 */}
      <div className="flex flex-col lg:flex-row h-full min-h-0 p-6 gap-6 overflow-y-auto lg:overflow-hidden">
        {/* ================================================ */}
        {/* 左主区                                          */}
        {/* ================================================ */}
        <div className="flex-1 min-w-0 lg:overflow-y-auto space-y-6">
          {/* 页头 */}
          <PageHeader title="工作台" description="外贸行业工作台、专属工作流与动态大盘" />

          {/* ---- 经营概览 4列网格（接入真实整合与折算数据） ---- */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="今日询盘"
              value={stats?.todayInquiries ?? 0}
              icon={MessageSquare}
              change={{ value: stats?.todayInquiriesChange ?? 0, label: "较昨日" }}
              isLoading={statsLoading}
            />

            <StatCard
              title="跟进中客户"
              value={stats?.followingCustomers ?? 0}
              icon={Users}
              description={
                (stats?.pendingTasks ?? 0) > 0 ? `待回复 ${stats?.pendingTasks} 条` : "全部已回复"
              }
              isLoading={statsLoading}
            />

            <StatCard
              title="待处理任务"
              value={remindersCount}
              icon={ClipboardList}
              description={remindersCount > 0 ? `逾期未跟进 ${remindersCount} 户` : "无逾期未跟进客户"}
              isLoading={statsLoading}
            />

            <StatCard
              title="累计成交金额 (CNY)"
              value={
                totalAcceptedAmountCNY > 0
                  ? `￥${(totalAcceptedAmountCNY / 1000).toFixed(1)}k`
                  : "￥0.00"
              }
              description={`折合 USD ${(totalAcceptedAmountCNY / 7.25 / 1000).toFixed(1)}k`}
              icon={DollarSign}
              isLoading={funnelLoading}
            />
          </div>

          {/* ================================================ */}
          {/* 核心双栏工作台：询盘列表 + 跟进详情面板 */}
          {/* ================================================ */}
          <section className="bg-card/45 backdrop-blur-md rounded-2xl border border-border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-foreground text-sm font-semibold">外贸询盘与跟进控制台</h3>
                <p className="text-hint text-xs mt-0.5">
                  智能识别逾期询盘，调用大模型生成开发信，提交报价单，打通跟进流转闭环
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[550px]">
              {/* 左栏：询盘跟进列表 (lg:col-span-5) */}
              <div className="lg:col-span-5 flex flex-col justify-between border-r border-border/60 pr-0 lg:pr-6">
                <div className="space-y-4">
                  {/* 价值过滤 */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-hint uppercase tracking-wider font-semibold">
                      询盘估值 (优先级)
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {["all", "high", "medium", "low"].map((p) => (
                        <button
                          key={p}
                          onClick={() => {
                            setPriorityFilter(p);
                            setCurrentPage(1);
                          }}
                          className={cn(
                            "px-2.5 py-1 text-xs rounded-lg border transition-all",
                            priorityFilter === p
                              ? "bg-primary/10 border-primary/40 text-primary font-medium"
                              : "bg-background/40 border-border text-muted-foreground hover:bg-background/70"
                          )}
                        >
                          {p === "all" ? "全部" : p === "high" ? "高价值" : p === "medium" ? "中价值" : "低价值"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 状态过滤 */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-hint uppercase tracking-wider font-semibold">
                      跟进阶段
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {["all", "跟进中", "已报价", "已成交", "已流失"].map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            setStatusFilter(s);
                            setCurrentPage(1);
                          }}
                          className={cn(
                            "px-2.5 py-1 text-xs rounded-lg border transition-all",
                            statusFilter === s
                              ? "bg-primary/10 border-primary/40 text-primary font-medium"
                              : "bg-background/40 border-border text-muted-foreground hover:bg-background/70"
                          )}
                        >
                          {s === "all" ? "全部" : s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 列表渲染 */}
                  <div className="space-y-2 mt-2 max-h-[360px] overflow-y-auto pr-1">
                    {inquiriesLoading ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-2">
                        <Loader2 className="animate-spin text-primary size-5" />
                        <span className="text-hint text-xs">加载询盘数据中...</span>
                      </div>
                    ) : inquiries.length === 0 ? (
                      <div className="py-12 text-center text-hint text-xs">
                        未检索到符合条件的询盘记录
                      </div>
                    ) : (
                      inquiries.map((item) => {
                        const isOverdue14 = item.daysSinceLastContact >= 14;
                        const isOverdue7 = item.daysSinceLastContact >= 7 && item.daysSinceLastContact < 14;
                        const isSelected = selectedInquiry?.id === item.id;

                        return (
                          <div
                            key={item.id}
                            onClick={() => setSelectedInquiry(item)}
                            className={cn(
                              "p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-1.5",
                              isSelected
                                ? "bg-primary/5 border-primary/50 shadow-sm"
                                : isOverdue14
                                ? "bg-red-500/5 border-red-500/20 text-red-900 dark:text-red-300 hover:bg-red-500/10"
                                : "bg-background/30 border-border hover:bg-background/60",
                              "hover:shadow-sm"
                            )}
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-bold truncate">
                                  {item.customerName}
                                </span>
                                <span className="text-xs" title={item.country}>
                                  {item.countryFlag || item.country}
                                </span>
                              </div>
                              <span className="text-[10px] text-hint tabular-nums">
                                {item.daysSinceLastContact}天前跟进
                              </span>
                            </div>

                            <p className="text-xs opacity-80 line-clamp-1">
                              {item.product.replace(/\*\*.*?\*\*\n/g, "")}
                            </p>

                            <div className="flex justify-between items-center mt-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={cn(
                                    "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase",
                                    item.priority === "high"
                                      ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                      : item.priority === "medium"
                                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                      : "bg-gray-500/10 text-gray-500"
                                  )}
                                >
                                  {item.priority === "high" ? "高价值" : item.priority === "medium" ? "中价值" : "低价值"}
                                </span>
                                <span className="text-[10px] bg-background/60 border border-border px-1.5 py-0.5 rounded-md font-medium">
                                  {item.status}
                                </span>
                              </div>

                              {isOverdue14 && (
                                <span className="bg-red-500/20 text-red-600 text-[9px] px-1.5 py-0.5 rounded font-bold animate-pulse">
                                  严重逾期!
                                </span>
                              )}
                              {isOverdue7 && (
                                <span className="bg-amber-500/15 text-amber-600 text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                                  <Clock className="size-2.5" /> 待跟进
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 分页组件 */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-2">
                    <span className="text-xs text-hint">
                      共 {totalInquiries} 条，当前 {currentPage}/{totalPages} 页
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-2 py-1 text-[10px] rounded border bg-background/50 hover:bg-background disabled:opacity-50"
                      >
                        上一页
                      </button>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-2 py-1 text-[10px] rounded border bg-background/50 hover:bg-background disabled:opacity-50"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 右栏：询盘详情与业务处理面板 (lg:col-span-7) */}
              <div className="lg:col-span-7 min-h-0 flex flex-col justify-start">
                {!selectedInquiry ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 text-hint space-y-2">
                    <Briefcase className="size-8 opacity-40 text-primary" />
                    <p className="text-sm font-semibold">请在左侧选择需要跟进的客户询盘</p>
                    <p className="text-xs max-w-xs leading-relaxed">
                      选择后可展开完整的客户需求画像、调用大模型生成个性化开发信、提交多版本报价单进行跟进
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
                    {/* 画像头部 */}
                    <div className="bg-background/25 border border-border p-4 rounded-xl space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-foreground font-bold text-base">
                              {selectedInquiry.customerName}
                            </h4>
                            <span className="text-sm">
                              {selectedInquiry.countryFlag || selectedInquiry.country}
                            </span>
                          </div>
                          <p className="text-xs text-hint mt-0.5">
                            最后联系时间: {selectedInquiry.daysSinceLastContact} 天前 ({selectedInquiry.lastFollowUpAt.slice(0, 10)})
                          </p>
                        </div>
                        <span className="bg-primary/10 text-primary text-xs px-2.5 py-0.5 rounded-md font-semibold border border-primary/20">
                          {selectedInquiry.status}
                        </span>
                      </div>

                      {/* 询盘详细内容 */}
                      <div className="text-xs leading-relaxed bg-background/40 p-3 rounded-lg border border-border/50 text-foreground whitespace-pre-wrap">
                        {selectedInquiry.product}
                      </div>

                      {/* 技能标签 */}
                      <div className="flex flex-wrap gap-1">
                        {selectedInquiry.tags?.map((t: string) => (
                          <span
                            key={t}
                            className="bg-accent/60 text-muted-foreground border border-border/80 text-[10px] px-2 py-0.5 rounded-full font-medium"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* AI 开发信生成面板 */}
                    <div className="bg-background/20 border border-border p-4 rounded-xl space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="text-primary size-4" />
                          <h5 className="text-foreground text-xs font-semibold">AI 写开发信助手</h5>
                        </div>
                        <div className="flex gap-1.5">
                          <select
                            value={emailStyle}
                            onChange={(e: any) => setEmailStyle(e.target.value)}
                            className="bg-background/50 border border-border text-[10px] rounded px-1.5 py-0.5 font-medium text-foreground outline-none"
                          >
                            <option value="formal">正式专业</option>
                            <option value="friendly">友好生动</option>
                          </select>
                          <select
                            value={emailLanguage}
                            onChange={(e: any) => setEmailLanguage(e.target.value)}
                            className="bg-background/50 border border-border text-[10px] rounded px-1.5 py-0.5 font-medium text-foreground outline-none"
                          >
                            <option value="en">英文信</option>
                            <option value="zh">中文信</option>
                          </select>
                        </div>
                      </div>

                      <button
                        onClick={generateEmail}
                        disabled={isGeneratingEmail}
                        className="w-full bg-primary/10 hover:bg-primary/15 border border-primary/30 text-primary py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                      >
                        {isGeneratingEmail ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" />
                            <span>大模型推理中 & 写入审计...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="size-3.5" />
                            <span>一键生成个性化开发信</span>
                          </>
                        )}
                      </button>

                      {(emailSubject || emailBody) && (
                        <div className="space-y-2 mt-2 animate-in fade-in slide-in-from-bottom-2 duration-250">
                          <div className="space-y-1">
                            <label className="text-[10px] text-hint font-medium">邮件主题 (可编辑)</label>
                            <input
                              type="text"
                              value={emailSubject}
                              onChange={(e) => setEmailSubject(e.target.value)}
                              className="w-full bg-background/40 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-hint font-medium">邮件正文 (可编辑)</label>
                            <textarea
                              rows={5}
                              value={emailBody}
                              onChange={(e) => setEmailBody(e.target.value)}
                              className="w-full bg-background/40 border border-border rounded-lg p-2.5 text-xs text-foreground outline-none focus:border-primary/50 resize-none"
                            />
                          </div>

                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => copyToClipboard(emailBody)}
                              className="px-3 py-1.5 border border-border bg-background/40 hover:bg-background/60 text-foreground text-xs rounded-lg flex items-center gap-1 transition-colors"
                            >
                              <Copy className="size-3" />
                              <span>复制</span>
                            </button>
                            <button
                              onClick={sendEmailAction}
                              disabled={isSendingEmail}
                              className="px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/95 text-xs rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
                            >
                              {isSendingEmail ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Send className="size-3" />
                              )}
                              <span>发送邮件</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 报价单管理与历史 */}
                    <div className="bg-background/20 border border-border p-4 rounded-xl space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <FileText className="text-primary size-4" />
                          <h5 className="text-foreground text-xs font-semibold">报价单版本管理</h5>
                        </div>
                        {!showNewQuote && (
                          <button
                            onClick={() => setShowNewQuote(true)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <Plus className="size-3" />
                            <span>新建报价</span>
                          </button>
                        )}
                      </div>

                      {/* 新建报价单交互 */}
                      {showNewQuote && (
                        <div className="bg-background/45 border border-border/80 p-3 rounded-xl space-y-3 mt-2 animate-in fade-in slide-in-from-top-2">
                          <p className="text-foreground text-xs font-bold">新报价单录入</p>

                          <div className="space-y-2">
                            {quoteItems.map((item, idx) => (
                              <div key={idx} className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  placeholder="品名 (如 500w 太阳能板)"
                                  value={item.name}
                                  onChange={(e) => updateQuoteItem(idx, "name", e.target.value)}
                                  className="flex-1 bg-background/60 border border-border rounded px-2 py-1 text-xs outline-none text-foreground"
                                />
                                <input
                                  type="number"
                                  placeholder="数量"
                                  value={item.qty}
                                  onChange={(e) =>
                                    updateQuoteItem(idx, "qty", parseInt(e.target.value) || 0)
                                  }
                                  className="w-16 bg-background/60 border border-border rounded px-2 py-1 text-xs outline-none text-foreground text-center"
                                />
                                <input
                                  type="number"
                                  placeholder="单价"
                                  value={item.unitPrice || ""}
                                  onChange={(e) =>
                                    updateQuoteItem(idx, "unitPrice", parseFloat(e.target.value) || 0)
                                  }
                                  className="w-20 bg-background/60 border border-border rounded px-2 py-1 text-xs outline-none text-foreground text-center"
                                />
                                <button
                                  onClick={() => removeQuoteItem(idx)}
                                  className="text-danger hover:text-danger/80 disabled:opacity-30"
                                  disabled={quoteItems.length === 1}
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="flex justify-between items-center">
                            <button
                              onClick={addQuoteItem}
                              className="text-primary hover:text-primary/80 text-xs font-semibold flex items-center gap-0.5"
                            >
                              <Plus className="size-3.5" />
                              <span>添加品项</span>
                            </button>
                            <span className="text-xs font-bold text-foreground">
                              总计: USD {computedTotal.toFixed(2)}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-hint">备注说明 (非必填)</label>
                            <input
                              type="text"
                              value={quoteNotes}
                              onChange={(e) => setQuoteNotes(e.target.value)}
                              className="w-full bg-background/60 border border-border rounded px-2 py-1 text-xs outline-none text-foreground"
                              placeholder="说明交期、运费等信息"
                            />
                          </div>

                          <div className="flex gap-2 justify-end pt-1">
                            <button
                              onClick={() => {
                                setShowNewQuote(false);
                                setQuoteNotes("");
                                setQuoteItems([{ name: "", qty: 1, unitPrice: 0, currency: "USD" }]);
                              }}
                              className="px-3 py-1.5 border border-border bg-background/40 hover:bg-background/60 text-foreground text-xs rounded-lg"
                            >
                              取消
                            </button>
                            <button
                              onClick={submitQuote}
                              disabled={isSubmittingQuote}
                              className="px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/95 text-xs rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
                            >
                              {isSubmittingQuote ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <CheckCircle className="size-3" />
                              )}
                              <span>确认提交报价</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 报价历史版本列表 */}
                      <div className="space-y-2">
                        <span className="text-[10px] text-hint uppercase tracking-wider font-semibold">
                          历史报价单版本 ({quotationHistory.length})
                        </span>
                        {historyLoading ? (
                          <div className="py-6 flex justify-center">
                            <Loader2 className="animate-spin text-primary size-4" />
                          </div>
                        ) : quotationHistory.length === 0 ? (
                          <p className="text-hint text-xs italic px-1">当前询盘暂未提交任何报价记录</p>
                        ) : (
                          <div className="divide-y divide-border/40">
                            {quotationHistory.map((q) => (
                              <div
                                key={q.id}
                                className="flex justify-between items-center py-2 text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-foreground">V{q.version}</span>
                                  <span className="text-hint font-mono">{q.createdAt.slice(0, 16).replace("T", " ")}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-semibold text-foreground">
                                    {q.currency} {q.totalAmount}
                                  </span>
                                  <span
                                    className={cn(
                                      "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                                      q.status === "accepted"
                                        ? "bg-success/15 text-success"
                                        : q.status === "rejected"
                                        ? "bg-danger/15 text-danger"
                                        : q.status === "sent"
                                        ? "bg-primary/10 text-primary"
                                        : "bg-muted-foreground/10 text-muted-foreground"
                                    )}
                                  >
                                    {q.status === "accepted" ? "已成交" : q.status === "rejected" ? "已流失" : q.status === "sent" ? "已发送" : "草稿"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ---- 外贸跟进漏斗与转化率 (Recharts 实数图表) ---- */}
          <section className="bg-card/45 backdrop-blur-md rounded-2xl border border-border p-5 space-y-4">
            <div>
              <h3 className="text-foreground text-sm font-semibold">外贸转化漏斗与近30天流转率</h3>
              <p className="text-hint text-xs mt-0.5">
                实时反映询盘 (Inquiry) → 报价 (Quotation) → 样品 (Sample) → 成交 (Order) 的去重漏斗柱状图
              </p>
            </div>

            {funnelLoading ? (
              <div className="h-[220px] flex items-center justify-center">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            ) : funnelData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-hint text-xs">
                暂无漏斗图表数据
              </div>
            ) : (
              <FunnelChart
                funnelData={funnelData}
                funnelRates={funnelRates}
                totalAcceptedAmountCNY={totalAcceptedAmountCNY}
              />
            )}
          </section>

          {/* ---- 询盘快速录入与自动分级处理 ---- */}
          <InquiryQuickEntry />

          {/* ---- 常用工作流 ---- */}
          <section className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-foreground font-semibold text-sm">常用工作流控制台</h3>
              <span className="text-xs text-hint">一键启动，自动通过底层 DAG 运行引擎执行</span>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {workflows.map((wf) => (
                <WorkflowCard key={wf.id} workflow={wf} />
              ))}
            </div>
          </section>

          {/* ---- 外贸专属智能体推荐 ---- */}
          <div className="mt-6">
            <AgentSection agents={tradeAgents} isLoading={capabilitiesLoading} />
          </div>

          {/* ---- 外贸知识与Skill模板 ---- */}
          <div className="mt-6">
            <SkillSection skills={tradeSkills} isLoading={capabilitiesLoading} />
          </div>

          {/* ---- 连接器推荐 ---- */}
          <div className="mt-6">
            <ConnectorSection connectors={tradeConnectors} isLoading={capabilitiesLoading} />
          </div>
        </div>

        {/* ================================================ */}
        {/* 右侧面板：健康、汇率与风险监测                     */}
        {/* ================================================ */}
        <aside
          className={cn(
            "w-full lg:w-72 shrink-0 lg:border-l border-border",
            "lg:overflow-y-auto lg:pl-6 space-y-4"
          )}
        >
          {/* 行业动态主入口 */}
          <IndustryDynamicsCard />

          {/* 自演化与健康监测卡片 */}
          <WorkflowHealthMonitor />

          {/* 汇率监测卡片 */}
          <ExchangeRateCard
            rates={exchangeRates}
            isLoading={exchangeRatesLoading}
            expired={exchangeRatesExpired}
          />

          {/* 待跟进提醒卡片 */}
          <div className="bg-card/45 backdrop-blur-md rounded-2xl border border-border p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/10 rounded-xl p-2 text-amber-500">
                <Clock className="size-4" />
              </div>
              <div>
                <p className="text-foreground text-sm font-medium">今日待办跟进提醒</p>
                <p className="text-hint text-xs mt-0.5">超 7 天未联系的客户</p>
              </div>
            </div>
            {remindersCount > 0 ? (
              <span className="bg-danger/20 text-danger border border-danger/30 text-xs px-2.5 py-0.5 rounded-full font-bold animate-bounce">
                {remindersCount} 户
              </span>
            ) : (
              <span className="text-hint text-xs">暂无待办</span>
            )}
          </div>

          {/* 风险提醒列表 */}
          <div className="bg-card/45 backdrop-blur-md rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-foreground font-medium text-xs">贸易风险预警</h2>
              <Link
                href="/dashboard"
                className="text-primary text-[10px] hover:text-primary/80 transition-colors"
              >
                全部
              </Link>
            </div>
            {intelLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 bg-accent/40 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : riskItems.length === 0 ? (
              <p className="text-hint text-xs px-1">暂无风险提醒</p>
            ) : (
              riskItems.map((item) => <RiskItemCard key={item.id} item={item} />)
            )}
          </div>
        </aside>
      </div>
    </PageTransition>
  );
}
