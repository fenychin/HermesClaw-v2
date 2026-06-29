/**
 * Subscription API — 获取用户订阅状态
 * Phase 2: 真实 Prisma 查询（替换旧 mock）
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildWorkspaceContext } from "@/lib/workspace";
import { writeAuditLog } from "@/lib/server/audit";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const ctx = await buildWorkspaceContext(req);

    // 记录查询订阅状态的审计日志
    await writeAuditLog({
      actor: session.user.email || session.user.id,
      action: "billing.subscription.view",
      targetType: "workspace",
      targetId: ctx.workspaceId,
      detail: `查询工作空间 ${ctx.workspaceId} 的订阅状态`,
      workspaceId: ctx.workspaceId,
      riskLevel: "low",
    });

    const sub = await prisma.subscription.findFirst({
      where: { userId: session.user.id, workspaceId: ctx.workspaceId },
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
