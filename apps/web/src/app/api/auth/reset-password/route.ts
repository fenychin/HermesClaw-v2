/**
 * Reset Password API — 使用 token 重置密码
 * Phase 2: 新增端点
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6, "密码长度不能少于 6 位"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

export async function POST(req: NextRequest) {
  try {
    // Rate limit
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    if (!rateLimit(`reset-password:${ip}`, 3, 60_000)) {
      return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });
    }

    const body = await req.json();
    const validation = resetPasswordSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || "输入校验失败";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { token, email, password } = validation.data;

    // 查找有效 token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return NextResponse.json({
        error: "重置链接已过期或已使用，请重新申请",
      }, { status: 400 });
    }

    // 验证 email 匹配
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.id !== resetToken.userId) {
      return NextResponse.json({ error: "邮箱与重置请求不匹配" }, { status: 400 });
    }

    // 更新密码
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // 标记 token 已使用
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    // 撤销该用户所有 session（强制重新登录）
    await prisma.session.deleteMany({ where: { userId: user.id } });

    return NextResponse.json({
      success: true,
      message: "密码重置成功，请使用新密码登录",
    });
  } catch (error) {
    console.error("Reset Password API error:", error);
    return NextResponse.json({ error: "重置密码失败，请稍后重试" }, { status: 500 });
  }
}
