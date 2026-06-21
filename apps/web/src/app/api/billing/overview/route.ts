/**
 * Billing Overview API — 账户账单总览
 * Phase 2: 真实 Prisma 查询（替换旧 mock）
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPoints } from "@/lib/server/credit-service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    // 查询真实订阅状态
    const subscription = await prisma.subscription.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    // 查询真实支付方式
    const paymentMethod = await prisma.paymentMethod.findFirst({
      where: { userId: session.user.id, isDefault: true },
    });

    // 查询真实积分
    const totalPoints = await getUserPoints(session.user.id);

    // 查询最近发票
    const invoices = await prisma.invoice.findMany({
      where: { userId: session.user.id },
      orderBy: { invoiceDate: "desc" },
      take: 6,
    });

    return NextResponse.json({
      plan: {
        name: subscription ? planNameMap[subscription.planId] || subscription.planId : "Free",
        active: subscription?.status === "active",
        nextBillingDate: subscription?.currentPeriodEnd?.toISOString().split("T")[0] || null,
        amount: invoices[0]?.amount || 0,
        paymentMethod: paymentMethod
          ? { last4: paymentMethod.last4, brand: paymentMethod.brand }
          : null,
      },
      credits: {
        total: totalPoints,
        used: 0, // TODO: 接入真实用量统计
        subscription: 0,
        dailyReward: 0,
        resetDate: subscription?.currentPeriodEnd?.toISOString().split("T")[0] || null,
      },
      invoices: invoices.map((inv) => ({
        id: inv.id,
        date: inv.invoiceDate.toISOString().split("T")[0],
        planName: inv.planName || "订阅",
        amount: inv.amount,
        status: inv.status === "paid" ? "Paid" : inv.status === "open" ? "Pending" : inv.status,
      })),
    });
  } catch (error) {
    console.error("Failed to get billing overview:", error);
    // 降级返回空数据而非硬编码 mock
    return NextResponse.json({
      plan: { name: "Free", active: false, nextBillingDate: null, amount: 0, paymentMethod: null },
      credits: { total: 0, used: 0, subscription: 0, dailyReward: 0, resetDate: null },
      invoices: [],
    });
  }
}

const planNameMap: Record<string, string> = {
  free: "Free",
  pro: "Professional",
  pro_plus: "Pro Plus",
  max: "Max",
  ultra: "Ultra",
};
