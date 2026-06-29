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

    // 1. 二阶段审计：创建预记录审计日志
    const auditEntry = await createAuditEntry({
      actor: session.user.email || session.user.id,
      action: "credits.purchased",
      targetType: "credit_ledger",
      targetId: session.user.id,
      detail: `发起购买 ${credits} 积分`,
      workspaceId: ctx.workspaceId,
      riskLevel: "medium",
    });

    // 2. 幂等性校验：如果带了 idempotencyKey，查重 referenceId
    if (idempotencyKey) {
      const existingPurchase = await prisma.creditLedger.findFirst({
        where: {
          userId: session.user.id,
          workspaceId: ctx.workspaceId,
          referenceId: idempotencyKey,
          type: "purchase",
        },
      });

      if (existingPurchase) {
        // 更新审计日志状态为 success
        await updateAuditEntry({
          auditId: auditEntry.auditId,
          status: "success",
          detail: `购买 ${credits} 积分（幂等命中直接返回）`,
        });

        return NextResponse.json({
          success: true,
          purchasedCredits: credits,
          message: `成功购买 ${credits} 积分（幂等）`,
        });
      }
    }

    // 3. 真实写入积分流水与更新审计状态
    try {
      await prisma.creditLedger.create({
        data: {
          userId: session.user.id,
          workspaceId: ctx.workspaceId,
          amount: credits,
          type: "purchase",
          description: `购买 ${credits} 积分`,
          referenceId: idempotencyKey || null,
        },
      });

      // 更新审计日志为成功
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "success",
        detail: `成功购买 ${credits} 积分`,
      });

      return NextResponse.json({
        success: true,
        purchasedCredits: credits,
        message: `成功购买 ${credits} 积分`,
      });
    } catch (dbErr: any) {
      // 更新审计日志为失败
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "failed",
        detail: `购买积分失败: ${dbErr.message || "未知数据库写入异常"}`,
      });
      throw dbErr;
    }
  } catch (error) {
    console.error("Failed to purchase credits:", error);
    return NextResponse.json({ error: "购买失败，请稍后重试" }, { status: 500 });
  }
}
