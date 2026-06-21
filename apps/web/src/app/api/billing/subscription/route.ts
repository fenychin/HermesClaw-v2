import { NextResponse } from "next/server";

export async function GET() {
  // 模拟返回当前用户的套餐状态为 free
  return NextResponse.json({
    planId: "free",
    status: "active",
    renewalDate: "2026-07-19"
  });
}
