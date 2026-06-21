/**
 * Forgot Password API — 发送重置密码邮件
 * Phase 2: 真实邮件服务 + Prisma Token 持久化（替换旧 console.log mock）
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/server/mail-service";
import crypto from "crypto";
import { z } from "zod";

const forgotPasswordSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
});

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 每分钟 3 次（防邮箱枚举）
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    if (!rateLimit(`forgot-password:${ip}`, 3, 60_000)) {
      return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });
    }

    const body = await req.json();
    const validation = forgotPasswordSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || "邮箱格式有误";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { email } = validation.data;

    // 查找用户
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // 防枚举：邮箱不存在也返回成功消息
      return NextResponse.json({
        success: true,
        message: "如果该邮箱已注册，您将收到重置密码邮件",
      });
    }

    // 生成密码重置 Token（1 小时有效）
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3600_000); // 1 小时

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // 发送重置邮件
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const resetUrl = `${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    const sent = await sendPasswordResetEmail(email, resetUrl);

    if (!sent) {
      return NextResponse.json({ error: "邮件发送失败，请稍后重试" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "如果该邮箱已注册，您将收到重置密码邮件",
    });
  } catch (error) {
    console.error("Forgot Password API error:", error);
    return NextResponse.json({ error: "请求失败，请稍后重试" }, { status: 500 });
  }
}
