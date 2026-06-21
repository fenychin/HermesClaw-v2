import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { credits } = body;
    
    if (!credits || typeof credits !== "number" || credits <= 0) {
      return NextResponse.json({ error: "非法充值积分数" }, { status: 400 });
    }

    // 模拟充值成功，并返回最新的用户积分
    return NextResponse.json({
      success: true,
      purchasedCredits: credits,
      message: `成功购买了 ${credits} 积分！`
    });
  } catch (err) {
    return NextResponse.json({ error: "请求解析失败" }, { status: 400 });
  }
}
