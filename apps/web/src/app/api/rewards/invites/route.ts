import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "5");

  // 模拟全量邀请记录数据
  const allInvites = [
    { email: "alex.wong@outlook.com", date: "2026-06-20 18:30", status: "Registered", points: 50 },
    { email: "sarah_k@gmail.com", date: "2026-06-20 11:15", status: "Registered", points: 50 },
    { email: "dev.li@tencent.com", date: "2026-06-19 09:40", status: "Pending", points: 0 },
    { email: "j.smith@yahoo.com", date: "2026-06-18 22:12", status: "Registered", points: 50 },
    { email: "hr_maria@baidu.com", date: "2026-06-17 15:04", status: "Registered", points: 50 },
    { email: "tony_stark@stark.com", date: "2026-06-16 11:20", status: "Pending", points: 0 }
  ];

  const total = allInvites.length;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const data = allInvites.slice(startIndex, endIndex);

  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}
