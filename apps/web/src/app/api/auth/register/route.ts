import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码长度不能少于 6 位"),
  confirmPassword: z.string(),
  turnstileToken: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "两次输入的密码不一致",
  path: ["confirmPassword"],
});

async function validateTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY || "1x0000000000000000000000000000000AA";
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
    });
    const data = await res.json();
    return !!data.success;
  } catch (err) {
    console.error("Cloudflare Turnstile verification failed:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Zod 数据格式校验
    const validation = registerSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || "输入校验失败";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { email, password, turnstileToken } = validation.data;

    // Turnstile 验证：在本地开发环境下，如果为空或为 bypass token 则免检放行
    let isTurnstileValid = false;
    if (process.env.NODE_ENV === "development" && (!turnstileToken || turnstileToken === "dev-token-bypass")) {
      isTurnstileValid = true;
    } else if (turnstileToken) {
      isTurnstileValid = await validateTurnstile(turnstileToken);
    }

    if (!isTurnstileValid) {
      return NextResponse.json({ error: "人机验证失败，请重新验证" }, { status: 400 });
    }

    // 检查邮箱冲突
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ error: "该邮箱已被注册" }, { status: 400 });
    }

    // 密码哈希
    const hashedPassword = await bcrypt.hash(password, 10);

    // 写入数据库
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: "member",
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Register API error:", error);
    return NextResponse.json({ error: "注册失败，请稍后重试" }, { status: 500 });
  }
}
