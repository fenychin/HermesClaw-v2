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

    // 模拟 Stripe 客户门户的重定向 URL
    return NextResponse.json({
      url: "https://billing.stripe.com/p/session/mock_hermesclaw_stripe_customer_portal"
    });
  } catch (err) {
    console.error("Failed to access billing portal:", err);
    return NextResponse.json({ error: "拉取支付管理入口失败，请稍后重试" }, { status: 500 });
  }
}
