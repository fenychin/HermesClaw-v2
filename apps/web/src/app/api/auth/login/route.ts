import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(1, "密码不能为空"),
  turnstileToken: z.string().optional(),
});

async function validateTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "development") return true; // 开发环境免检
    throw new Error("TURNSTILE_SECRET_KEY is required");
  }
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
    // Rate limit: 每分钟 5 次登录尝试（防暴力破解）
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    if (!rateLimit(`login:${ip}`, 5, 60_000)) {
      return NextResponse.json({ error: "登录尝试过于频繁，请稍后重试" }, { status: 429 });
    }

    const body = await req.json();

    // Zod 数据格式校验
    const validation = loginSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || "输入校验失败";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { email, password, turnstileToken } = validation.data;

    // Turnstile 验证：生产环境强制验证；开发环境可通过 DISABLE_TURNSTILE=true 跳过
    let isTurnstileValid = false;
    if (process.env.DISABLE_TURNSTILE === "true") {
      isTurnstileValid = true;
    } else if (turnstileToken) {
      isTurnstileValid = await validateTurnstile(turnstileToken);
    }

    if (!isTurnstileValid) {
      return NextResponse.json({ error: "人机验证失败，请重新验证" }, { status: 400 });
    }

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      return NextResponse.json({ error: "邮箱或密码错误" }, { status: 400 });
    }

    // 比对密码
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "邮箱或密码错误" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Login API error:", error);
    return NextResponse.json({ error: "登录失败，请稍后重试" }, { status: 500 });
  }
}
