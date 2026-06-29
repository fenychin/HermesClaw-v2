import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildWorkspaceContext } from "@/lib/workspace";
import { createAuditEntry, updateAuditEntry } from "@/lib/server/audit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { planId, interval, idempotencyKey } = body;

    if (!planId || !interval || !["month", "year"].includes(interval)) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const ctx = await buildWorkspaceContext(req);

    // 1. 二阶段审计：创建预记录审计日志
    const auditEntry = await createAuditEntry({
      actor: session.user.email || session.user.id,
      action: "subscription.checkout",
      targetType: "subscription",
      targetId: session.user.id,
      detail: `发起购买/升级套餐: ${planId} (${interval})`,
      workspaceId: ctx.workspaceId,
      riskLevel: "medium",
    });

    // ======================================================================
    // P0 安全拦截：Stripe Checkout Session 集成前返回「待接入」状态
    // —— 原代码返回硬编码假 Stripe URL，用户点击后会导航至无效页面
    // —— Phase 2b 完成后替换为：
    //    const session = await stripe.checkout.sessions.create({ ... })
    //    return NextResponse.json({ stripeCheckoutUrl: session.url })
    // ======================================================================

    // 更新审计状态为拦截
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "success",
      detail: `套餐升级请求被安全拦截（Stripe 集成中）: ${planId} (${interval})` +
        (idempotencyKey ? ` (IdempKey: ${idempotencyKey})` : ""),
    });

    return NextResponse.json(
      { error: "支付系统正在集成中，套餐升级功能即将上线，敬请期待" },
      { status: 501 },
    );
  } catch (err) {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
}
