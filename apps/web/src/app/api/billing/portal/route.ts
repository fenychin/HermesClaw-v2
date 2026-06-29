import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildWorkspaceContext } from "@/lib/workspace";
import { writeAuditLog } from "@/lib/server/audit";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const ctx = await buildWorkspaceContext(req);

    // 记录访问审计日志
    await writeAuditLog({
      actor: session.user.email || session.user.id,
      action: "subscription.portal_access",
      targetType: "subscription",
      targetId: session.user.id,
      detail: `访问 Stripe 支付管理门户`,
      workspaceId: ctx.workspaceId,
      riskLevel: "low",
    });

    // ======================================================================
    // P0 安全拦截：Stripe Portal 集成前返回「待接入」状态
    // —— 原代码返回硬编码假 Stripe Portal URL
    // —— Phase 2b 完成后替换为：
    //    const session = await stripe.billingPortal.sessions.create({ ... })
    //    return NextResponse.json({ url: session.url })
    // ======================================================================
    return NextResponse.json(
      { error: "支付系统正在集成中，账单管理功能即将上线，敬请期待" },
      { status: 501 }
    );
  } catch (err) {
    console.error("Failed to access billing portal:", err);
    return NextResponse.json({ error: "拉取支付管理入口失败，请稍后重试" }, { status: 500 });
  }
}
