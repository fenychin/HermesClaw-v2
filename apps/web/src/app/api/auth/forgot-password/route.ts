import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const forgotPasswordSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 校验输入
    const validation = forgotPasswordSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || "邮箱格式有误";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { email } = validation.data;

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json({ error: "该邮箱尚未注册" }, { status: 400 });
    }

    // 模拟生成重置 Token，并打印模拟链接
    const mockToken = Math.random().toString(36).substring(2, 15);
    const mockResetUrl = `${req.nextUrl.origin}/reset-password?token=${mockToken}&email=${encodeURIComponent(email)}`;
    
    console.log("=========================================");
    console.log(`[AUTH] 忘记密码请求已收到。`);
    console.log(`用户邮箱: ${email}`);
    console.log(`模拟重置密码 URL: ${mockResetUrl}`);
    console.log("=========================================");

    return NextResponse.json({
      success: true,
      message: "邮件已发送，请查收",
    });
  } catch (error) {
    console.error("Forgot Password API error:", error);
    return NextResponse.json({ error: "请求失败，请稍后重试" }, { status: 500 });
  }
}
