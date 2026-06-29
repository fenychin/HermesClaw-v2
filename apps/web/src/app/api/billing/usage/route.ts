/**
 * Usage API — 积分用量历史（近 30 天）
 * Phase 2 修复: 从 CreditLedger 查询真实用量（替换 Math.sin mock）
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
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "current_cycle";
    const days = range === "current_cycle" ? 30 : parseInt(range) || 30;

    // 记录访问使用量历史审计日志
    await writeAuditLog({
      actor: session.user.email || session.user.id,
      action: "billing.usage.view",
      targetType: "workspace",
      targetId: ctx.workspaceId,
      detail: `查询工作空间 ${ctx.workspaceId} 最近 ${days} 天的积分用量`,
      workspaceId: ctx.workspaceId,
      riskLevel: "low",
    });

    // 查询最近 N 天的积分消费（负数 = 使用）
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const usages = await prisma.creditLedger.findMany({
      where: {
        userId: session.user.id,
        workspaceId: ctx.workspaceId,
        amount: { lt: 0 }, // 只查消费记录
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: "asc" },
      select: { amount: true, createdAt: true },
    });

    // 按天聚合
    const dailyMap = new Map<string, number>();
    for (const u of usages) {
      const day = `${u.createdAt.getMonth() + 1}/${u.createdAt.getDate()}`;
      dailyMap.set(day, (dailyMap.get(day) || 0) + Math.abs(u.amount));
    }

    // 填充 30 天完整数据
    const data = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
      data.push({
        date: dateStr,
        credits: parseFloat((dailyMap.get(dateStr) || 0).toFixed(1)),
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch usage data:", error);
    return NextResponse.json([]);
  }
}
