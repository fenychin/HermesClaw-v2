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

    try {
      // 模拟成功生成 Stripe checkout session URL
      const stripeCheckoutUrl = `https://checkout.stripe.com/c/pay/mock_session_hermesclaw_${planId}_${interval}`;

      // 2. 更新审计状态为成功
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "success",
        detail: `成功生成套餐升级支付链接: ${planId} (${interval})` + (idempotencyKey ? ` (IdempKey: ${idempotencyKey})` : ""),
      });

      return NextResponse.json({
        stripeCheckoutUrl
      });
    } catch (err: any) {
      // 更新审计状态为失败
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "failed",
        detail: `套餐升级支付链接生成失败: ${err.message || "未知错误"}`
      });
      throw err;
    }
  } catch (err) {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
}
