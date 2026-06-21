import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  // 返回 Mock 绑定的三方社交账户状态
  return NextResponse.json({
    twitter: { connected: false, username: "" },
    discord: { connected: true, username: "HermesDev#1234", connectedAt: "2026-05-12 14:32" },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // 模拟各种社交账号连接与断开动作
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    return NextResponse.json({ error: "更新资料失败" }, { status: 500 });
  }
}
