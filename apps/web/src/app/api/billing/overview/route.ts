/**
 * Billing Overview API — 账户账单总览
 * Phase 2: 真实 Prisma 查询（替换旧 mock）
 */
import { NextRequest, NextResponse } from "next/server";
import { buildWorkspaceContext } from "@/lib/workspace";
import { writeAuditLog } from "@/lib/server/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const ctx = await buildWorkspaceContext(req);

    // 记录访问账单总览审计日志
    await writeAuditLog({
      actor: session.user.email || session.user.id,
      action: "billing.overview.view",
      targetType: "workspace",
      targetId: ctx.workspaceId,
      detail: `访问工作空间 ${ctx.workspaceId} 的账单与积分总览`,
      workspaceId: ctx.workspaceId,
      riskLevel: "low",
    });

    // ★ v3.0 性能优化：并行执行所有隔离的数据库查询与统计聚合
    const [
      subscription,
      paymentMethod,
      invoices,
      totalCreditsSum,
      usedCreditsSum,
      subCreditsSum,
      dailyCreditsSum
    ] = await Promise.all([
      prisma.subscription.findFirst({
        where: { userId: session.user.id, workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.paymentMethod.findFirst({
        where: { userId: session.user.id, isDefault: true },
      }),
      prisma.invoice.findMany({
        where: { userId: session.user.id, workspaceId: ctx.workspaceId },
        orderBy: { invoiceDate: "desc" },
        take: 6,
      }),
      prisma.creditLedger.aggregate({
        where: { userId: session.user.id, workspaceId: ctx.workspaceId },
        _sum: { amount: true },
      }),
      prisma.creditLedger.aggregate({
        where: { userId: session.user.id, workspaceId: ctx.workspaceId, amount: { lt: 0 } },
        _sum: { amount: true },
      }),
      prisma.creditLedger.aggregate({
        where: { userId: session.user.id, workspaceId: ctx.workspaceId, type: "subscription", amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      prisma.creditLedger.aggregate({
        where: { userId: session.user.id, workspaceId: ctx.workspaceId, type: "daily_reward", amount: { gt: 0 } },
        _sum: { amount: true },
      }),
    ]);

    const totalPoints = totalCreditsSum._sum.amount || 0;
    const usedPoints = Math.abs(usedCreditsSum._sum.amount || 0);
    const subPoints = subCreditsSum._sum.amount || 0;
    const dailyPoints = dailyCreditsSum._sum.amount || 0;

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
        used: usedPoints,
        subscription: subPoints,
        dailyReward: dailyPoints,
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
