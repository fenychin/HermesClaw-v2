import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { createAuditEntry, updateAuditEntry } from "@/lib/server/audit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码长度不能少于 6 位"),
  confirmPassword: z.string(),
  turnstileToken: z.string().optional(),
  inviteCode: z.string().optional(), // 接收可选的邀请码
}).refine((data) => data.password === data.confirmPassword, {
  message: "两次输入的密码不一致",
  path: ["confirmPassword"],
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
    // Rate limit: 每分钟 3 次注册尝试（防批量注册）
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    if (!rateLimit(`register:${ip}`, 3, 60_000)) {
      return NextResponse.json({ error: "注册请求过于频繁，请稍后重试" }, { status: 429 });
    }

    const body = await req.json();
    
    // Zod 数据格式校验
    const validation = registerSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || "输入校验失败";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { email, password, turnstileToken, inviteCode } = validation.data;

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

    // 检查邮箱冲突
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ error: "该邮箱已被注册" }, { status: 400 });
    }

    // 密码哈希（salt rounds 可通过 BCRYPT_SALT_ROUNDS 环境变量配置，默认 10）
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10);
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 写入数据库
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: process.env.DEFAULT_USER_ROLE || "member",
      },
    });

    // 如果带有邀请码，进行营销激励归因
    if (inviteCode) {
      try {
        const invite = await prisma.invite.findFirst({
          where: { inviteCode, status: "pending" },
        });

        if (invite) {
          // 获取邀请人所属的主工作空间 ID
          const inviterMember = await prisma.workspaceMember.findFirst({
            where: { userId: invite.inviterId },
            select: { workspaceId: true },
          });
          const workspaceId = inviterMember?.workspaceId || "default";

          // 1. 创建二阶段审计日志预记录：邀请积分发放
          const auditEntry = await createAuditEntry({
            actor: "system",
            action: "invite.bonus.awarded",
            targetType: "invite",
            targetId: invite.id,
            detail: `受邀用户 ${email} 注册成功，发起增发邀请人与被邀请人积分`,
            workspaceId,
            riskLevel: "medium",
          });

          // 2. 在 Prisma 事务中原子化发放双方积分与状态变更
          await prisma.$transaction([
            // 给邀请人 +50 积分
            prisma.creditLedger.create({
              data: {
                userId: invite.inviterId,
                workspaceId,
                amount: 50,
                type: "invite_bonus",
                description: `邀请奖励：受邀人 ${email} 注册成功`,
                referenceId: invite.id,
              },
            }),
            // 给被邀请人 +20 积分
            prisma.creditLedger.create({
              data: {
                userId: user.id,
                workspaceId,
                amount: 20,
                type: "invite_bonus",
                description: "受邀注册新人礼包积分",
                referenceId: invite.id,
              },
            }),
            // 更新邀请关系状态为已注册
            prisma.invite.update({
              where: { id: invite.id },
              data: {
                status: "registered",
                pointsAwarded: 50,
                registeredAt: new Date(),
                inviteeEmail: email,
              },
            }),
          ]);

          // 更新审计日志为成功
          await updateAuditEntry({
            auditId: auditEntry.auditId,
            status: "success",
            detail: `成功向邀请人(${invite.inviterId})发放 50 积分，向受邀人(${user.id})发放 20 积分`,
          });
        }
      } catch (inviteErr) {
        console.error("Failed to process invite referral:", inviteErr);
        // 归因失败不应阻断注册主流程
      }
    }

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
