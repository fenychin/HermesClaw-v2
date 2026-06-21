/**
 * Security API — 密码修改 / 设备管理
 * Phase 2: 真实 Prisma 实现（替换旧 mock）
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { writeAuditLog } from "@/lib/server/audit";
import { buildWorkspaceContext } from "@/lib/workspace";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    // 获取活跃的 session 列表（作为设备列表的近似）
    const sessions = await prisma.session.findMany({
      where: { userId: session.user.id },
      orderBy: { expires: "desc" },
      select: {
        id: true,
        expires: true,
        sessionToken: true,
      },
    });

    const now = new Date();
    const devices = sessions.map((s, i) => {
      const expired = s.expires < now;
      const hoursUntilExpiry = Math.max(0, Math.round((s.expires.getTime() - now.getTime()) / 3600000));
      return {
        id: s.id,
        name: expired ? "已过期设备" : `设备 ${i + 1}`,
        lastActive: expired ? "已过期" : hoursUntilExpiry <= 1 ? "刚刚" : `${hoursUntilExpiry}小时前`,
        current: i === 0,
        expired,
      };
    });

    return NextResponse.json({
      twoFactorEnabled: false, // TODO: 后续接入真实 2FA
      devices: devices.length > 0 ? devices : [{ id: "1", name: "当前设备", lastActive: "刚刚", current: true, expired: false }],
    });
  } catch (error) {
    console.error("Failed to get security info:", error);
    return NextResponse.json({ error: "获取安全信息失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const body = await req.json();
    const { action } = body;

    const ctx = await buildWorkspaceContext(req);

    if (action === "change-password") {
      const { currentPassword, newPassword } = body;
      if (!currentPassword || !newPassword) {
        return NextResponse.json({ error: "请输入当前密码和新密码" }, { status: 400 });
      }
      if (newPassword.length < 6) {
        return NextResponse.json({ error: "新密码长度不能少于 6 位" }, { status: 400 });
      }

      // 验证当前密码
      const user = await prisma.user.findUnique({ where: { id: session.user.id } });
      if (!user?.password) {
        return NextResponse.json({ error: "该账户未设置密码" }, { status: 400 });
      }
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
      }

      // 更新密码
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: session.user.id },
        data: { password: hashedPassword },
      });

      // 审计留痕
      await writeAuditLog({
        actor: session.user.email || session.user.id,
        action: "password.changed",
        targetType: "user",
        targetId: session.user.id,
        detail: "用户修改密码",
        workspaceId: ctx.workspaceId,
        riskLevel: "medium",
      });

      return NextResponse.json({ success: true, message: "密码更新成功" });
    }

    if (action === "logout-device") {
      const { deviceId } = body;
      if (!deviceId) {
        return NextResponse.json({ error: "请指定设备" }, { status: 400 });
      }
      // 删除指定 session
      await prisma.session.deleteMany({
        where: { id: deviceId, userId: session.user.id },
      });
      return NextResponse.json({ success: true, message: "设备已被成功强制登出" });
    }

    if (action === "logout-all-others") {
      // 删除除当前外的所有 session
      await prisma.session.deleteMany({
        where: {
          userId: session.user.id,
          NOT: { id: body.currentDeviceId || undefined },
        },
      });
      return NextResponse.json({ success: true, message: "已成功登出所有其他设备" });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    console.error("Security action failed:", error);
    return NextResponse.json({ error: "操作失败，请重试" }, { status: 500 });
  }
}
