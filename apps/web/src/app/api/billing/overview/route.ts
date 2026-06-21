import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    plan: {
      name: "Professional",
      active: true,
      nextBillingDate: "2026-07-19",
      amount: 29.00,
      paymentMethod: {
        last4: "4242",
        brand: "Visa"
      }
    },
    credits: {
      used: 32.2, // 32.2 / 35.0 = 92% (用于测试超出 90% 变警告橙的效果)
      total: 35.0,
      subscription: 27.2,
      dailyReward: 5.0,
      resetDate: "2026-07-19"
    },
    invoices: [
      {
        id: "inv_001",
        date: "2026-06-19",
        planName: "Professional 套餐 - 月付",
        amount: 29.00,
        status: "Paid"
      },
      {
        id: "inv_002",
        date: "2026-05-19",
        planName: "Professional 套餐 - 月付",
        amount: 29.00,
        status: "Paid"
      }
    ]
  });
}
