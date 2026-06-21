/**
 * Subscription API — 获取用户订阅状态
 * Phase 2: 真实 Prisma 查询（替换旧 mock）
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    if (!sub) {
      return NextResponse.json({
        planId: "free",
        status: "active",
        renewalDate: null,
      });
    }

    return NextResponse.json({
      planId: sub.planId,
      status: sub.status,
      renewalDate: sub.currentPeriodEnd?.toISOString().split("T")[0] || null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    });
  } catch (error) {
    console.error("Failed to get subscription:", error);
    return NextResponse.json({
      planId: "free",
      status: "active",
      renewalDate: null,
    });
  }
}
