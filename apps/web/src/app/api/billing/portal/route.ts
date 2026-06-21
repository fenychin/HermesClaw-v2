import { NextResponse } from "next/server";

export async function GET() {
  // 模拟 Stripe 客户门户的重定向 URL
  return NextResponse.json({
    url: "https://billing.stripe.com/p/session/mock_hermesclaw_stripe_customer_portal"
  });
}
