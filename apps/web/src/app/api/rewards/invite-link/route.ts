import { NextResponse } from "next/server";

export async function GET() {
  // 模拟返回当前用户的专属邀请链接
  return NextResponse.json({
    url: "https://hermesclaw.ai/invite/hc_usr_99824"
  });
}
