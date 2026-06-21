import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { planId, interval } = body;

    if (!planId || !interval || !["month", "year"].includes(interval)) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    // 模拟成功生成 Stripe checkout session URL
    return NextResponse.json({
      stripeCheckoutUrl: `https://checkout.stripe.com/c/pay/mock_session_hermesclaw_${planId}_${interval}`
    });
  } catch (err) {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
}
