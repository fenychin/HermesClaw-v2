/**
 * Preferences API — 用户偏好管理
 * Phase 2: 真实 Prisma 持久化（替换旧 echo mock）
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPreferences, updateUserPreferences } from "@/lib/server/settings-service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const prefs = await getUserPreferences(session.user.id);
    return NextResponse.json(prefs);
  } catch (error) {
    console.error("Failed to get preferences:", error);
    return NextResponse.json({ error: "获取偏好失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const body = await req.json();
    await updateUserPreferences(session.user.id, body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update preferences:", error);
    return NextResponse.json({ error: "保存偏好失败" }, { status: 500 });
  }
}
