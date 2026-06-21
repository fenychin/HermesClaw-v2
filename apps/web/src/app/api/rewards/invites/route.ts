/**
 * Invites History API — 获取用户邀请历史
 * Phase 2: 真实 Prisma 实现（替换旧 mock）
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "5");

    const [data, total] = await Promise.all([
      prisma.invite.findMany({
        where: { inviterId: session.user.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          inviteeEmail: true,
          status: true,
          pointsAwarded: true,
          createdAt: true,
          registeredAt: true,
        },
      }),
      prisma.invite.count({ where: { inviterId: session.user.id } }),
    ]);

    const formatted = data.map((inv) => ({
      email: inv.inviteeEmail || "待填写",
      date: inv.createdAt.toISOString().replace("T", " ").substring(0, 16),
      status: inv.status === "registered" ? "Registered" : "Pending",
      points: inv.pointsAwarded,
    }));

    return NextResponse.json({
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to fetch invites:", error);
    return NextResponse.json({ error: "获取邀请记录失败" }, { status: 500 });
  }
}
