import { NextResponse } from "next/server";

export async function GET() {
  const data = [];
  const now = new Date();
  // 模拟最近 30 天计费周期的积分消耗历史
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
    // 模拟有规律波动的消耗数据
    const credits = parseFloat((Math.sin(i / 2) * 0.8 + 1.2 + Math.random() * 0.4).toFixed(1));
    data.push({ date: dateStr, credits });
  }
  return NextResponse.json(data);
}
