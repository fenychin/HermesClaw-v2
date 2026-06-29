"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { 
  Sparkles, 
  Check, 
  Loader2, 
  Crown,
  Minus,
  Plus,
  ArrowLeft,
  Info,
  Gift
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PLANS, Plan } from "@/constants/plans";

// 功能勾标志组件 (品牌紫)
const CheckIcon = ({ className }: { className?: string }) => (
  <svg 
    className={className || "size-4 text-[#6D5EF9] shrink-0"} 
    fill="none" 
    viewBox="0 0 24 24" 
    stroke="currentColor" 
    strokeWidth="3"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

export default function PlansPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  
  // 当前用户的订阅信息
  const [subscription, setSubscription] = useState<{
    planId: string;
    status: string;
    renewalDate: string;
  } | null>(null);

  // 计费周期切换状态：默认年付高亮
  const [billingCycle, setBillingCycle] = useState<"month" | "year">("year");

  // 升级 CTA 按钮的正在加载态
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);

  // 积分充值状态
  const [purchaseAmount, setPurchaseAmount] = useState(100);
  const [purchasing, setPurchasing] = useState(false);
  const [purchasingBulk, setPurchasingBulk] = useState(false);

  // 1. 初始化拉取订阅状态
  useEffect(() => {
    async function fetchSub() {
      try {
        const res = await fetch("/api/billing/subscription");
        if (res.ok) {
          const data = await res.json();
          setSubscription(data);
        }
      } catch (err) {
        toast.error("拉取订阅状态失败");
      } finally {
        setLoading(false);
      }
    }
    fetchSub();
  }, []);
  // 2. 升级订阅套餐逻辑
  const handleUpgrade = async (planId: string) => {
    if (subscription?.planId === planId) return; // 当前套餐
    setLoadingPlanId(planId);
    try {
      const idempotencyKey = `idemp_checkout_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, interval: billingCycle, idempotencyKey })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.stripeCheckoutUrl) {
          toast.success("正在前往 Stripe 支付安全页面...");
          window.location.href = data.stripeCheckoutUrl;
        } else {
          throw new Error("未找到 Stripe 支付地址");
        }
      } else {
        throw new Error(data.error || "套餐升级失败");
      }
    } catch (err: any) {
      toast.error(err.message || "无法拉取 Stripe 升级入口，请稍后重试");
    } finally {
      setLoadingPlanId(null);
    }
  };

  // 3. 积分包购买逻辑
  // 灵活充值计算：单价原本为 0.15 积分，满 250 积分打 7 折为 0.105 积分
  const isFlexibleDiscounted = purchaseAmount >= 250;
  const flexibleUnitPrice = isFlexibleDiscounted ? 0.105 : 0.15;
  const flexibleOriginalPrice = purchaseAmount * 0.15;
  const flexibleFinalPrice = purchaseAmount * flexibleUnitPrice;

  const handleQuickSelect = (val: number) => {
    setPurchaseAmount(val);
  };

  const handleIncrement = () => {
    setPurchaseAmount((prev) => prev + 10);
  };

  const handleDecrement = () => {
    setPurchaseAmount((prev) => Math.max(10, prev - 10));
  };

  const handlePurchaseFlexible = async () => {
    setPurchasing(true);
    try {
      const idempotencyKey = `idemp_credits_purchase_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      const res = await fetch("/api/billing/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits: purchaseAmount, idempotencyKey })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`充值成功！已向账户购买并注入了 ${purchaseAmount} 积分！`);
      } else {
        throw new Error(data.error || "积分充值交易失败");
      }
    } catch (err: any) {
      toast.error(err.message || "购买充值交易失败，请核实支付状态");
    } finally {
      setPurchasing(false);
    }
  };

  const handlePurchaseBulk = async () => {
    setPurchasingBulk(true);
    try {
      const idempotencyKey = `idemp_credits_purchase_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      const res = await fetch("/api/billing/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits: 4000, idempotencyKey })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("充值成功！已向您的账户注入了 4000 积分大礼包！");
      } else {
        throw new Error(data.error || "充值交易失败");
      }
    } catch (err: any) {
      toast.error(err.message || "充值交易失败，请重试");
    } finally {
      setPurchasingBulk(false);
    }
  };
  if (loading || !subscription) {
    return (
      <div className="min-h-screen bg-[#050505] text-[#F5F5F5] font-sans px-8 py-12 flex flex-col items-center justify-start select-none animate-pulse space-y-12">
        <div className="space-y-3.5 text-center">
          <Skeleton className="h-8 w-44 bg-[#262626] mx-auto" />
          <Skeleton className="h-4 w-96 bg-[#262626] mx-auto" />
        </div>
        <Skeleton className="h-10 w-44 bg-[#111111] rounded-full mx-auto" />
        <div className="grid grid-cols-3 gap-6 w-full max-w-6xl">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[480px] bg-[#111111] rounded-[16px] border border-[#262626]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#F5F5F5] font-sans px-6 py-12 md:px-12 lg:px-24 select-none relative overflow-x-hidden">
      {/* 返回按钮 (右上角/左上角) */}
      <div className="max-w-6xl mx-auto mb-6">
        <button
          onClick={() => router.push("/settings/billing")}
          className="flex items-center gap-1.5 text-xs text-[#B3B3B3] hover:text-[#F5F5F5] transition-colors cursor-pointer bg-transparent border-none outline-none font-semibold"
        >
          <ArrowLeft className="size-3.5" />
          返回账单设置
        </button>
      </div>

      {/* 顶部标题区 */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="text-3xl md:text-4xl font-extrabold tracking-tight">套餐与定价</div>
        <p className="text-sm text-[#B3B3B3] leading-relaxed">
          选择适合总工作流程的套餐，随时升级或降级
        </p>
      </div>

      {/* 计费周期切换器 */}
      <div className="flex justify-center mt-10">
        <div className="flex bg-[#111111] border border-[#262626] p-1 rounded-full relative">
          {/* 月付 Tab */}
          <button
            type="button"
            onClick={() => setBillingCycle("month")}
            className={`h-9 px-6 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              billingCycle === "month"
                ? "bg-[#6D5EF9] text-white"
                : "text-[#B3B3B3] hover:text-[#F5F5F5]"
            }`}
          >
            月付
          </button>
          
          {/* 年付 Tab */}
          <button
            type="button"
            onClick={() => setBillingCycle("year")}
            className={`h-9 px-6 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 relative ${
              billingCycle === "year"
                ? "bg-[#6D5EF9] text-white"
                : "text-[#B3B3B3] hover:text-[#F5F5F5]"
            }`}
          >
            <span>年付</span>
            <span className={`inline-flex px-1 py-0.5 rounded-[4px] text-[8px] font-bold leading-none ${
              billingCycle === "year" ? "bg-white/20 text-white" : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
            }`}>
              节省20%
            </span>
          </button>
        </div>
      </div>

      {/* 套餐卡片区 (5列网格/自适应) */}
      <div className="max-w-6xl mx-auto mt-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 items-stretch">
          {PLANS.map((plan) => {
            const isCurrent = subscription.planId === plan.id;
            
            // 年日付计算，并带有过渡过渡动效
            const currentPrice = billingCycle === "year" ? plan.yearlyPrice : plan.monthlyPrice;
            
            return (
              <div
                key={plan.id}
                className={`rounded-[16px] p-5 flex flex-col justify-between relative transition-all duration-300 ${
                  plan.premium
                    ? "bg-gradient-to-br from-[#171717] via-[#201C3E] to-[#121024] border-[#6D5EF9]/40 text-white shadow-xl shadow-[#6D5EF9]/5"
                    : "bg-[#111111] border border-[#262626] hover:border-[#333333]"
                } ${plan.recommended ? "ring-1 ring-[#6D5EF9] border-[#6D5EF9]" : ""}`}
              >
                {/* 各种角标 */}
                {plan.recommended && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#6D5EF9] text-white shadow-md">
                    推荐
                  </div>
                )}
                {plan.premium && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md flex items-center gap-1">
                    <Crown className="size-2.5" />
                    Premium
                  </div>
                )}

                <div className="space-y-5">
                  {/* 卡片头部 */}
                  <div className="space-y-1">
                    <span className={`text-[10px] font-extrabold uppercase tracking-widest ${
                      plan.premium ? "text-amber-400" : "text-[#B3B3B3]/60"
                    }`}>
                      {plan.tag}
                    </span>
                    <div className="flex items-baseline gap-0.5 mt-1 select-all">
                      <span className="text-3xl font-extrabold font-mono transition-all duration-200">
                        ${currentPrice}
                      </span>
                      <span className="text-[10px] text-[#B3B3B3]/60 font-medium">
                        {billingCycle === "year" && plan.yearlyPrice > 0 
                          ? "/月，按年计费" 
                          : plan.monthlyPrice > 0 ? "/月" : ""}
                      </span>
                    </div>
                  </div>

                  {/* 特征列表 */}
                  <ul className="space-y-3.5 text-xs text-[#B3B3B3] border-t border-[#262626] pt-4">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckIcon className={`size-3.5 shrink-0 mt-0.5 ${
                          plan.premium ? "text-amber-400" : "text-[#6D5EF9]"
                        }`} />
                        <span className="leading-snug">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 卡片 CTA 按钮 */}
                <div className="pt-6">
                  {isCurrent ? (
                    <Button
                      disabled
                      className="w-full h-10 rounded-[12px] bg-[#262626] text-[#B3B3B3]/50 border-none font-semibold text-xs cursor-not-allowed"
                    >
                      当前套餐
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={loadingPlanId !== null}
                      className={`w-full h-10 rounded-[12px] font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-all ${
                        plan.premium
                          ? "bg-white hover:bg-white/90 text-[#050505]"
                          : "bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white"
                      }`}
                    >
                      {loadingPlanId === plan.id && <Loader2 className="size-3.5 animate-spin" />}
                      {plan.id === "free" ? "退回到 Free" : plan.tag === "PRO" ? "获取 Pro" : plan.tag === "PRO PLUS" ? "获取 Pro Plus" : plan.tag === "MAX" ? "获取 Max" : "获取 Ultra"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ==========================================
          积分包购买区
         ========================================== */}
      <div className="max-w-6xl mx-auto mt-16 pt-10 border-t border-[#262626]/80 space-y-6">
        <div className="space-y-1">
          <div className="text-xl font-bold flex items-center gap-1.5">
            <Gift className="size-5 text-[#6D5EF9]" />
            购买积分
          </div>
          <p className="text-xs text-[#B3B3B3] max-w-2xl leading-relaxed">
            需要更多积分？以每积分 $0.15 的价格购买任意数量，购买 4,000+ 积分可享 30% 折扣！
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 左卡：灵活购买 */}
          <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 flex flex-col justify-between h-[230px] shadow-sm">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#F5F5F5] font-semibold">灵活自主购买</span>
                {isFlexibleDiscounted && (
                  <span className="inline-flex px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    批量充值 7 折特惠
                  </span>
                )}
              </div>

              {/* 步进器及快选 */}
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
                  {[50, 100, 250, 500, 1000].map((val) => (
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

              {/* 实时合计价格 */}
              <div className="flex items-center justify-between text-xs pt-1.5 min-h-[22px]">
                {isFlexibleDiscounted ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[#B3B3B3]/40 line-through font-mono">${flexibleOriginalPrice.toFixed(2)}</span>
                    <span className="text-emerald-500 font-bold font-mono">${flexibleFinalPrice.toFixed(2)}</span>
                    <span className="text-[10px] px-1 bg-emerald-500/10 text-emerald-500 rounded border border-emerald-500/20 leading-none py-0.5 font-semibold">
                      每积分$0.105
                    </span>
                  </div>
                ) : (
                  <div className="text-[#B3B3B3]/60 flex items-center gap-1.5">
                    <span className="font-mono">${flexibleFinalPrice.toFixed(2)}</span>
                    <span className="text-[9px] text-[#B3B3B3]/40">单价: $0.15/积分 (满250打7折)</span>
                  </div>
                )}
              </div>
            </div>

            <Button
              onClick={handlePurchaseFlexible}
              disabled={purchasing}
              className="w-full h-10 rounded-[12px] bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
            >
              {purchasing && <Loader2 className="size-3.5 animate-spin" />}
              购买 {purchaseAmount} 积分
            </Button>
          </div>

          {/* 右卡：固定 4000 积分批量大优惠 */}
          <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 flex flex-col justify-between h-[230px] shadow-sm relative group hover:border-[#333333]/80 transition-all">
            <div className="absolute top-4 right-4">
              <span className="inline-flex px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-sm">
                30%折扣
              </span>
            </div>

            <div className="space-y-4">
              <div className="space-y-0.5">
                <span className="text-xs text-[#B3B3B3] font-medium">企业级批量礼包</span>
                <div className="text-[#F5F5F5] text-2xl font-bold font-mono">
                  4,000 积分
                </div>
              </div>

              {/* 折扣合计 */}
              <div className="flex items-center gap-2.5 pt-1.5 select-all">
                <span className="text-[#B3B3B3]/40 line-through font-mono text-base font-bold">$600.00</span>
                <span className="text-emerald-500 font-extrabold font-mono text-2xl">$420.00</span>
                <span className="text-[10px] px-1 bg-emerald-500/10 text-emerald-500 rounded border border-emerald-500/20 leading-none py-0.5 font-semibold">
                  每积分 $0.105
                </span>
              </div>
              <p className="text-[10px] text-[#B3B3B3]/50 leading-relaxed">
                购买一次性注入大量计算配额。适合执行高频次的复杂 Workflow 任务及大规模 Multi-Agent 编排。
              </p>
            </div>

            <Button
              onClick={handlePurchaseBulk}
              disabled={purchasingBulk}
              className="w-full h-10 rounded-[12px] bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
            >
              {purchasingBulk && <Loader2 className="size-3.5 animate-spin" />}
              购买 4000 积分
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
