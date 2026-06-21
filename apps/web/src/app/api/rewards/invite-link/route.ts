/**
 * Invite Link API — 生成/获取用户专属邀请链接
 * Phase 2: 真实 Prisma 实现（替换旧 mock）
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    // 查找已有邀请码或创建新邀请码
    let invite = await prisma.invite.findFirst({
      where: { inviterId: session.user.id, status: "pending" },
      orderBy: { createdAt: "desc" },
    });

    if (!invite) {
      const inviteCode = `hc_inv_${crypto.randomUUID().replace(/-/g, "").substring(0, 12)}`;
      invite = await prisma.invite.create({
        data: {
          inviterId: session.user.id,
          inviteeEmail: "", // 待填写
          inviteCode,
        },
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://hermesclaw.ai";
    return NextResponse.json({
      url: `${baseUrl}/invite/${invite.inviteCode}`,
      code: invite.inviteCode,
    });
  } catch (error) {
    console.error("Failed to get invite link:", error);
    return NextResponse.json({ error: "获取邀请链接失败" }, { status: 500 });
  }
}
