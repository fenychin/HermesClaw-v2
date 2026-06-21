/**
 * Profile API — 用户资料与社交连接状态
 * Phase 2: 真实 Prisma 实现（替换旧 mock）
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        image: true,
        createdAt: true,
      },
    });

    // 查询 OAuth 连接状态
    const oauthAccounts = await prisma.account.findMany({
      where: { userId: session.user.id },
      select: { provider: true, providerAccountId: true },
    });

    const twitterConnected = oauthAccounts.some((a) => a.provider === "twitter");
    const discordConnected = oauthAccounts.some((a) => a.provider === "discord");
    const googleConnected = oauthAccounts.some((a) => a.provider === "google");

    return NextResponse.json({
      name: user?.name,
      email: user?.email,
      avatar: user?.image,
      joinedAt: user?.createdAt?.toISOString().split("T")[0],
      connections: {
        twitter: { connected: twitterConnected, username: twitterConnected ? "已连接" : "" },
        discord: { connected: discordConnected, username: discordConnected ? "已连接" : "" },
        google: { connected: googleConnected, username: googleConnected ? "已连接" : "" },
      },
    });
  } catch (error) {
    console.error("Failed to get profile:", error);
    return NextResponse.json({ error: "获取资料失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const body = await req.json();
    const { name } = body;

    if (name) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { name },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update profile:", error);
    return NextResponse.json({ error: "更新资料失败" }, { status: 500 });
  }
}
