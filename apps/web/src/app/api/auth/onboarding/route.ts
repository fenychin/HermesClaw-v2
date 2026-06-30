import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createAuditEntry, updateAuditEntry } from "@/lib/server/audit";
import { installPack } from "@/lib/server/industry-pack-loader";
import { z } from "zod";
import fs from "fs";
import path from "path";

// 动态载入 yaml 模块
const yaml = require("yaml");

const onboardingSchema = z.object({
  name: z.string().min(1, "姓名/昵称不能为空").max(50, "姓名过长"),
  workspaceName: z.string().min(1, "工作空间名称不能为空").max(100, "工作空间名称过长"),
  industry: z.enum(["foreign-trade", "general"]),
});

function resolvePacksDir(): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "industry-packs"),
    path.resolve(cwd, "..", "industry-packs"),
    path.resolve(cwd, "..", "..", "industry-packs"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[candidates.length - 1];
}

export async function POST(req: NextRequest) {
  try {
    // 1. 获取 Session 会话
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登录，请先登录" }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. 限流保护：每个 IP 每分钟最多 5 次引导请求
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    if (!rateLimit(`onboarding:${ip}`, 5, 60_000)) {
      return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });
    }

    // 3. 数据校验
    const body = await req.json();
    const validation = onboardingSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || "参数校验失败";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { name, workspaceName, industry } = validation.data;

    // 4. 确认用户是否存在
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { workspaceMemberships: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 防重入：如果用户已经有关联的工作空间，直接重定向，不要重复创建
    if (user.workspaceMemberships.length > 0) {
      return NextResponse.json({
        success: true,
        message: "您已完成引导，正在进入工作空间",
        workspaceId: user.workspaceMemberships[0].workspaceId,
      });
    }

    // 5. 启动两阶段审计日志
    const auditEntry = await createAuditEntry({
      actor: userId,
      action: "user.onboarding.completed",
      targetType: "user",
      targetId: userId,
      detail: `用户完成新手引导，正在初始化首个工作空间: "${workspaceName}"，选择行业: ${industry}`,
      workspaceId: "default", // 临时使用 default，稍后修改
      riskLevel: "low",
    });

    // 6. 执行 Prisma 嵌套事务：更新用户信息、创建 Workspace、初始化 WorkspaceSettings 与关联 WorkspaceMember
    const workspace = await prisma.$transaction(async (tx) => {
      // (a) 更新用户姓名
      await tx.user.update({
        where: { id: userId },
        data: { name },
      });

      // (b) 创建工作空间，并同时嵌套创建 settings 和 OWNER 成员
      const ws = await tx.workspace.create({
        data: {
          name: workspaceName,
          plan: "free",
          automationLevel: "L2",
          status: "active",
          settings: {
            create: {
              defaultModel: "deepseek-chat",
              taskProviderMap: "{}",
              workflowEngine: "local",
              evalWindowHours: 24,
            },
          },
          members: {
            create: {
              userId,
              role: "OWNER",
            },
          },
        },
      });

      return ws;
    });

    // 7. 如果用户选择的是外贸行业包，后台静默自动安装
    if (industry === "foreign-trade") {
      try {
        const packsDir = resolvePacksDir();
        const manifestPath = path.join(packsDir, "foreign-trade", "manifest.yaml");
        if (fs.existsSync(manifestPath)) {
          const fileRaw = fs.readFileSync(manifestPath, "utf-8");
          const manifest = yaml.parse(fileRaw);

          // 自动安装并注册所有相关的数字员工、技能与工作流组件
          await installPack(manifest, workspace.id, userId);
        }
      } catch (packErr) {
        console.error("Failed to auto-install foreign-trade pack during onboarding:", packErr);
        // 静默安装失败不应阻断 onboarding 引导主链路的成功返回
      }
    }

    // 8. 更新审计日志状态为成功，并记录新创建的工作空间 ID
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "success",
      detail: `成功为用户 ${userId} 初始化工作空间 ${workspace.id} 并赋予 OWNER 权限（已预装并启用 ${industry === "foreign-trade" ? "外贸行业包" : "通用模版"}）`,
      workspaceId: workspace.id, // 将审计日志移至新工作空间归口
    });

    return NextResponse.json({
      success: true,
      workspaceId: workspace.id,
    });
  } catch (error) {
    console.error("Onboarding API error:", error);
    return NextResponse.json({ error: "引导初始化失败，请稍后重试" }, { status: 500 });
  }
}
