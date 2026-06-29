/**
 * Credits Purchase API — 积分购买
 * Phase 2: 真实写入 CreditLedger + AuditLog（替换旧 mock）
 *
 * 注意：真实支付需接入 Stripe PaymentIntent，当前版本为服务端验证框架，
 * 实际扣款需 Phase 2b Stripe 集成完成。
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditEntry, updateAuditEntry } from "@/lib/server/audit";
import { buildWorkspaceContext } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const body = await req.json();
    const { credits, idempotencyKey } = body;

    if (!credits || typeof credits !== "number" || credits <= 0) {
      return NextResponse.json({ error: "非法充值积分数" }, { status: 400 });
    }

    if (credits > 10000) {
      return NextResponse.json({ error: "单次充值不能超过 10000 积分" }, { status: 400 });
    }

    const ctx = await buildWorkspaceContext(req);

    // ======================================================================
    // P0 安全拦截：Stripe PaymentIntent 集成前禁止直接写入积分
    // —— 当前版本未接入真实支付网关，若直接写入 CreditLedger 会导致
    //    用户可无限免费刷积分（资金级漏洞）
    // —— Phase 2b Stripe 集成后：
    //    1. 创建 PaymentIntent / CheckoutSession
    //    2. 等待 Stripe webhook 确认支付成功
    //    3. 在 webhook handler 中写入 CreditLedger
    // ======================================================================

    // 记录拦截审计日志
    await createAuditEntry({
      actor: session.user.email || session.user.id,
      action: "credits.purchase.blocked",
      targetType: "credit_ledger",
      targetId: session.user.id,
      detail: `积分购买请求被安全拦截（支付系统集成中）: ${credits} 积分` +
        (idempotencyKey ? ` (IdempKey: ${idempotencyKey})` : ""),
      workspaceId: ctx.workspaceId,
      riskLevel: "medium",
    });

    return NextResponse.json(
      { error: "支付系统正在集成中，积分购买功能即将上线，敬请期待" },
      { status: 501 },
    );
  } catch (error) {
    console.error("Failed to process credits purchase request:", error);
    return NextResponse.json({ error: "请求处理失败" }, { status: 500 });
  }
}
