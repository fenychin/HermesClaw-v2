"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { 
  Sparkles, 
  Calendar, 
  CreditCard, 
  Wallet, 
  Minus, 
  Plus, 
  Loader2, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  FileText,
  HelpCircle,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// 自动重试的动态导入包装函数，解决 HMR 编译或网络瞬时抖动导致的 ChunkLoadError
const loadComponentWithRetry = <T,>(importFn: () => Promise<T>, retries = 3, interval = 1000): Promise<T> => {
  return new Promise((resolve, reject) => {
    importFn()
      .then(resolve)
      .catch((error) => {
        // 如果是 ChunkLoadError，尝试重新加载
        if (retries === 0) {
          reject(error);
          return;
        }
        setTimeout(() => {
          loadComponentWithRetry(importFn, retries - 1, interval).then(resolve, reject);
        }, interval);
      });
  });
};

// 异步 SSR-safe 导入折线图组件，加载过程中渲染 Skeleton，包含重试容错与泛型类型保留
const UsageChart = dynamic(() => loadComponentWithRetry(() => import("./_components/usage-chart")), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full bg-[#111111] border border-[#262626] rounded-[16px] animate-pulse" />
});

// React 错误边界，防止图表渲染或加载崩溃导致整个账单主页面白屏
class ChartErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: any, errorInfo: any) {
    console.error("UsageChart load failed:", error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-[300px] bg-[#111111] border border-[#262626] rounded-[16px] p-5 flex flex-col items-center justify-center text-center select-none">
          <AlertCircle className="size-8 text-[#EF4444] mb-2" />
          <div className="text-[#F5F5F5] text-sm font-semibold mb-1">使用量图表加载失败</div>
          <p className="text-[#B3B3B3] text-xs max-w-xs mb-4">
            可能是网络抖动或组件热重载所致，点击下方按钮尝试重新加载。
          </p>
          <Button 
            size="sm"
            onClick={() => {
              this.setState({ hasError: false });
            }}
            className="h-8 rounded-lg bg-[#1F1F1F] text-[#F5F5F5] border border-[#262626] hover:bg-[#2A2A2A] text-xs cursor-pointer"
          >
            重试
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface BillingOverview {
  plan: {
    name: string;
    active: boolean;
    nextBillingDate: string | null;
    amount: number;
    paymentMethod: {
      last4: string;
      brand: string;
    } | null;
  };
  credits: {
    used: number;
    total: number;
    subscription: number;
    dailyReward: number;
    resetDate: string;
  };
  invoices: Array<{
    id: string;
    date: string;
    planName: string;
    amount: number;
    status: string;
  }>;
}

interface UsageDataItem {
  date: string;
  credits: number;
}

// 格式化日期为 "xxxx年x月x日"
const formatDateToChinese = (dateStr: string | null | undefined) => {
  if (!dateStr) return "无即将到来的收费";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};

// 渲染卡品牌图标
const renderCardBrandIcon = (brand: string) => {
  const normalized = brand.toLowerCase();
  if (normalized === "visa") {
    return (
      <svg className="size-6 text-[#1A1F71]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2m5.2 12.8H15L16.2 9h2.2L17.2 14.8m-6-5.8 1 3.5.4-2.1c.1-.8-.4-1.4-1.2-1.4H8.8L8.7 9l2.1.2c.4 0 .4.2.4.6l-1.3 5h2.2L14.7 9h-3.5M6.2 9H4.1L4 9.2c1.7.4 2.8 1.1 3.2 2.2l.8-4H6.2m-1.2 5.8h.4l.6-2.9 2-2.9H6l-1 5.8z"/>
      </svg>
    );
  }
  return <CreditCard className="size-4 text-[#B3B3B3]" />;
};

export default function BillingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [usageData, setUsageData] = useState<UsageDataItem[]>([]);
  
  // Stripe portal 重定向加载态
  const [redirectingPortal, setRedirectingPortal] = useState(false);
  
  // 积分购买状态
  const [purchaseAmount, setPurchaseAmount] = useState(100);
  const [purchasing, setPurchasing] = useState(false);

  // 下载发票中的状态记录
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

  // 1. 初始化拉取数据
  useEffect(() => {
    async function fetchData() {
      try {
        const [overviewRes, usageRes] = await Promise.all([
          fetch("/api/billing/overview"),
          fetch("/api/billing/usage?range=current_cycle")
        ]);

        if (overviewRes.ok && usageRes.ok) {
          const overviewJson = await overviewRes.json();
          const usageJson = await usageRes.json();
          setOverview(overviewJson);
          setUsageData(usageJson);
        }
      } catch (err) {
        toast.error("加载账单信息失败，请重试");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // 2. 跳转 Stripe 门户
  const handleManagePayment = async () => {
    setRedirectingPortal(true);
    try {
      const res = await fetch("/api/billing/portal");
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          toast.success("正在安全前往支付方式管理中心...");
          window.location.href = data.url;
        } else {
          throw new Error();
        }
      } else {
        throw new Error();
      }
    } catch {
      toast.error("无法拉取支付管理入口，请联系客服");
      setRedirectingPortal(false);
    }
  };

  // 3. 积分包购买计算
  const isDiscounted = purchaseAmount >= 250;
  const unitPrice = isDiscounted ? 0.105 : 0.15; // 30% 折扣后为 0.105
  const originalPrice = purchaseAmount * 0.15;
  const finalPrice = purchaseAmount * unitPrice;

  const handleQuickSelect = (val: number) => {
    setPurchaseAmount(val);
  };

  const handleIncrement = () => {
    setPurchaseAmount((prev) => prev + 10);
  };

  const handleDecrement = () => {
    setPurchaseAmount((prev) => Math.max(10, prev - 10));
  };

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      const res = await fetch("/api/billing/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits: purchaseAmount })
      });
      if (res.ok) {
        toast.success(`成功充值了 ${purchaseAmount} 积分！`);
        // 本地更新积分量提供 WOW 级别的即时交互
        if (overview) {
          setOverview({
            ...overview,
            credits: {
              ...overview.credits,
              total: overview.credits.total + purchaseAmount
            }
          });
        }
      } else {
        throw new Error();
      }
    } catch {
      toast.error("充值交易失败，请核实支付账户");
    } finally {
      setPurchasing(false);
    }
  };

  // 4. 下载 PDF 发票
  const handleDownloadInvoice = async (invoiceId: string) => {
    setDownloadingInvoiceId(invoiceId);
    try {
      const res = await fetch(`/api/billing/invoices/${invoiceId}/download`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `invoice_${invoiceId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast.success(`发票 ${invoiceId} 下载成功`);
      } else {
        throw new Error();
      }
    } catch {
      toast.error("发票下载失败");
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  // 骨架屏加载态呈现
  if (loading || !overview) {
    return (
      <div className="space-y-8 select-none font-sans animate-pulse">
        {/* 标题 */}
        <div className="space-y-1.5 pb-5 border-b border-[#262626]">
          <Skeleton className="h-7 w-28 bg-[#262626]" />
          <Skeleton className="h-4 w-72 bg-[#262626]" />
        </div>
        {/* 4格卡片骨架 */}
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 bg-[#111111] rounded-[16px] border border-[#262626]" />
          ))}
        </div>
        {/* 积分详情双卡片骨架 */}
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-48 bg-[#111111] rounded-[16px] border border-[#262626]" />
          <Skeleton className="h-48 bg-[#111111] rounded-[16px] border border-[#262626]" />
        </div>
        {/* 图表骨架 */}
        <Skeleton className="h-[300px] w-full bg-[#111111] rounded-[16px] border border-[#262626]" />
      </div>
    );
  }

  // 计算积分进度百分比
  const usedCredits = overview.credits.used;
  const totalCredits = overview.credits.total;
  const usagePercentage = Math.min(100, parseFloat(((usedCredits / totalCredits) * 100).toFixed(1)));
  
  // 超出 90% 变警告橙 #F59E0B，否则是品牌紫 #6D5EF9
  const isExceededWarning = usagePercentage >= 90;
  const progressColor = isExceededWarning ? "bg-[#F59E0B]" : "bg-[#6D5EF9]";
  const progressTextColor = isExceededWarning ? "text-[#F59E0B]" : "text-[#6D5EF9]";

  return (
    <div className="space-y-8 font-sans">
      {/* 标题 */}
      <div className="space-y-1.5 border-b border-[#262626] pb-5 select-none">
        <div className="text-[#F5F5F5] text-2xl font-bold">账单管理</div>
        <p className="text-[#B3B3B3] text-sm">
          查看您的订阅套餐，充值账户积分，并管理支付方式与发票
        </p>
      </div>

      {/* ==========================================
          区块1：账单概览（4格信息卡）
         ========================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
        {/* 卡1：当前套餐 */}
        <div className="bg-[#171717] border border-[#262626] rounded-[16px] p-4 flex flex-col justify-between min-h-[110px] shadow-sm relative group hover:border-[#333333] transition-all">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] text-[#B3B3B3]/60 font-semibold tracking-wider uppercase">当前套餐</span>
              <div className="text-[#F5F5F5] text-base font-bold flex items-center gap-1.5">
                {overview.plan.name}
                {overview.plan.active && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 leading-none">
                    Active
                  </span>
                )}
              </div>
            </div>
            <div className="size-8 rounded-full bg-[#262626] flex items-center justify-center text-[#6D5EF9]">
              <Sparkles className="size-4" />
            </div>
          </div>
          <button
            onClick={() => window.location.href = "/billing/plans"}
            className="text-[11px] text-[#6D5EF9] font-semibold hover:text-[#6D5EF9]/90 text-left mt-2 flex items-center gap-0.5 group cursor-pointer"
          >
            升级套餐
            <ExternalLink className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>

        {/* 卡2：下次续费 */}
        <div className="bg-[#171717] border border-[#262626] rounded-[16px] p-4 flex flex-col justify-between min-h-[110px] shadow-sm hover:border-[#333333] transition-all">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] text-[#B3B3B3]/60 font-semibold tracking-wider uppercase">下次续费</span>
              <div className="text-[#F5F5F5] text-sm font-bold mt-0.5 leading-snug">
                {formatDateToChinese(overview.plan.nextBillingDate)}
              </div>
            </div>
            <div className="size-8 rounded-full bg-[#262626] flex items-center justify-center text-[#B3B3B3]">
              <Calendar className="size-4" />
            </div>
          </div>
          <div className="text-[10px] text-[#B3B3B3]/50">
            自动按月结账
          </div>
        </div>

        {/* 卡3：金额 */}
        <div className="bg-[#171717] border border-[#262626] rounded-[16px] p-4 flex flex-col justify-between min-h-[110px] shadow-sm hover:border-[#333333] transition-all">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] text-[#B3B3B3]/60 font-semibold tracking-wider uppercase">下次账单金额</span>
              <div className="text-[#F5F5F5] text-lg font-mono font-bold mt-0.5">
                ${overview.plan.amount.toFixed(2)}
              </div>
            </div>
            <div className="size-8 rounded-full bg-[#262626] flex items-center justify-center text-[#B3B3B3]">
              <Wallet className="size-4" />
            </div>
          </div>
          <div className="text-[10px] text-[#B3B3B3]/50">
            含应纳税款金额
          </div>
        </div>

        {/* 卡4：支付方式 */}
        <div className="bg-[#171717] border border-[#262626] rounded-[16px] p-4 flex flex-col justify-between min-h-[110px] shadow-sm hover:border-[#333333] transition-all">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] text-[#B3B3B3]/60 font-semibold tracking-wider uppercase">支付方式</span>
              {overview.plan.paymentMethod ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  {renderCardBrandIcon(overview.plan.paymentMethod.brand)}
                  <span className="text-[#F5F5F5] text-xs font-mono font-bold">
                    •••• {overview.plan.paymentMethod.last4}
                  </span>
                </div>
              ) : (
                <div className="text-[#B3B3B3]/50 text-xs mt-1">未设置支付方式</div>
              )}
            </div>
            <div className="size-8 rounded-full bg-[#262626] flex items-center justify-center text-[#B3B3B3]">
              <CreditCard className="size-4" />
            </div>
          </div>
          <button
            onClick={handleManagePayment}
            disabled={redirectingPortal}
            className="text-[11px] text-[#B3B3B3] hover:text-[#F5F5F5] font-semibold text-left mt-2 flex items-center gap-1 cursor-pointer"
          >
            {redirectingPortal && <Loader2 className="size-3 animate-spin" />}
            管理支付方式
          </button>
        </div>
      </div>

      {/* ==========================================
          区块2：积分使用与积分包购买 (双卡)
         ========================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 左卡：套餐积分 */}
        <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 flex flex-col justify-between h-[230px] shadow-sm select-none">
          <div className="space-y-3.5">
            <div className="flex justify-between items-end">
              <div className="space-y-0.5">
                <span className="text-xs text-[#B3B3B3] font-medium">账户积分使用</span>
                <div className="text-[#F5F5F5] text-2xl font-bold font-mono">
                  {usedCredits} <span className="text-xs text-[#B3B3B3]/50 font-normal">/ {totalCredits}</span>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-[10px] font-bold ${progressTextColor}`}>
                  已使用 {usagePercentage}%
                </span>
                <div className="text-[9px] text-[#B3B3B3]/40 mt-0.5">积分剩余</div>
              </div>
            </div>

            {/* 横向进度条 (超出 90% 变橙色) */}
            <div className="w-full h-2.5 bg-[#262626] rounded-full overflow-hidden border border-[#333333]/30">
              <div 
                className={`h-full transition-all duration-500 rounded-full ${progressColor}`}
                style={{ width: `${usagePercentage}%` }}
              />
            </div>

            {/* 积分构成明细 */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="flex items-center gap-2 text-xs text-[#B3B3B3]">
                <span className="size-2 rounded-full bg-[#6D5EF9]" />
                <span className="truncate">订阅积分: {overview.credits.subscription}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#B3B3B3]">
                <span className="size-2 rounded-full bg-[#4da3ff]" />
                <span className="truncate">每日奖励积分: {overview.credits.dailyReward}</span>
              </div>
            </div>
          </div>

          {/* 底部重置时间 */}
          <div className="border-t border-[#262626] pt-3 text-[10px] text-[#B3B3B3]/60 flex items-center gap-1">
            <span>🔄 积分重置于 {formatDateToChinese(overview.credits.resetDate)}</span>
          </div>
        </div>

        {/* 右卡：积分包购买 */}
        <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 flex flex-col justify-between h-[230px] shadow-sm select-none">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#F5F5F5] font-semibold">快速充值额外积分</span>
              {isDiscounted && (
                <span className="inline-flex px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  超值 7 折优惠已激活
                </span>
              )}
            </div>

            {/* 步进器及快捷数值 */}
            <div className="flex gap-2">
              <div className="flex items-center bg-[#171717] border border-[#262626] rounded-xl h-10 px-2 shrink-0">
                <button
                  onClick={handleDecrement}
                  type="button"
                  className="flex size-6 items-center justify-center rounded-lg text-[#B3B3B3] hover:text-[#F5F5F5] hover:bg-[#262626] transition-colors"
                >
                  <Minus className="size-3.5" />
                </button>
                <input
                  type="text"
                  value={purchaseAmount}
                  onChange={(e) => setPurchaseAmount(Math.max(10, parseInt(e.target.value.replace(/\D/g, "")) || 10))}
                  className="w-12 text-center text-xs font-bold font-mono bg-transparent outline-none border-none text-[#F5F5F5]"
                />
                <button
                  onClick={handleIncrement}
                  type="button"
                  className="flex size-6 items-center justify-center rounded-lg text-[#B3B3B3] hover:text-[#F5F5F5] hover:bg-[#262626] transition-colors"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              <div className="flex gap-1.5 flex-1 overflow-x-auto no-scrollbar">
                {[50, 100, 250, 500].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleQuickSelect(val)}
                    className={`flex-1 min-w-[40px] h-10 rounded-xl border text-xs font-semibold font-mono transition-all ${
                      purchaseAmount === val
                        ? "bg-[#6D5EF9]/10 border-[#6D5EF9] text-[#F5F5F5]"
                        : "bg-[#171717] border-[#262626] text-[#B3B3B3] hover:border-[#333333]"
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            {/* 30% 折扣批量购买区 */}
            <div className="flex items-center justify-between text-xs pt-1.5 min-h-[22px]">
              {isDiscounted ? (
                <div className="flex items-center gap-2">
                  <span className="text-[#B3B3B3]/40 line-through font-mono">${originalPrice.toFixed(2)}</span>
                  <span className="text-emerald-500 font-bold font-mono">${finalPrice.toFixed(2)}</span>
                  <span className="text-[10px] px-1 bg-emerald-500/10 text-emerald-500 rounded border border-emerald-500/20 leading-none py-0.5 font-semibold">
                    每积分$0.105
                  </span>
                </div>
              ) : (
                <div className="text-[#B3B3B3]/60 flex items-center gap-1.5">
                  <span className="font-mono">${finalPrice.toFixed(2)}</span>
                  <span className="text-[9px] text-[#B3B3B3]/40">单价: $0.15/积分 (满250打7折)</span>
                </div>
              )}
            </div>
          </div>

          {/* 购买按钮 */}
          <Button
            onClick={handlePurchase}
            disabled={purchasing}
            className="w-full h-10 rounded-[12px] bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
          >
            {purchasing && <Loader2 className="size-3.5 animate-spin" />}
            购买 {purchaseAmount} 积分
          </Button>
        </div>
      </div>

      {/* ==========================================
          区块3：本周期每日使用量（折线图）
         ========================================== */}
      <ChartErrorBoundary>
        <UsageChart data={usageData} />
      </ChartErrorBoundary>

      {/* ==========================================
          区块4：发票记录
         ========================================== */}
      <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 space-y-4">
        <div className="text-[#F5F5F5] text-sm font-semibold select-none flex items-center gap-1.5">
          <FileText className="size-4 text-[#6D5EF9]" />
          历史付款发票
        </div>

        {overview.invoices.length === 0 ? (
          /* 发票空态 */
          <div className="p-10 border border-[#262626] border-dashed rounded-xl text-center flex flex-col items-center justify-center space-y-3.5 select-none">
            <div className="size-10 rounded-full bg-[#171717] border border-[#262626] flex items-center justify-center text-[#B3B3B3]">
              <HelpCircle className="size-5" />
            </div>
            <div className="space-y-0.5">
              <div className="text-xs text-[#F5F5F5] font-semibold">暂无发票</div>
              <p className="text-[10px] text-[#B3B3B3]/50">您的发票将在首次付款后显示在此处</p>
            </div>
          </div>
        ) : (
          /* 发票表格 */
          <div className="overflow-x-auto border border-[#262626] rounded-xl select-none">
            <table className="w-full text-left border-collapse text-xs text-[#B3B3B3]">
              <thead>
                <tr className="bg-[#171717] border-b border-[#262626] text-[#F5F5F5] font-semibold">
                  <th className="p-3">发票日期</th>
                  <th className="p-3">订阅套餐</th>
                  <th className="p-3">付款金额</th>
                  <th className="p-3">付款状态</th>
                  <th className="p-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {overview.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-[#262626]/50 hover:bg-[#171717]/40 transition-colors">
                    <td className="p-3">{inv.date}</td>
                    <td className="p-3 text-[#F5F5F5] font-medium">{inv.planName}</td>
                    <td className="p-3 font-mono font-semibold">${inv.amount.toFixed(2)}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        已付清
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDownloadInvoice(inv.id)}
                        disabled={downloadingInvoiceId === inv.id}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#B3B3B3] hover:text-[#F5F5F5] cursor-pointer bg-transparent border-none outline-none"
                      >
                        {downloadingInvoiceId === inv.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Download className="size-3" />
                        )}
                        下载 PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
