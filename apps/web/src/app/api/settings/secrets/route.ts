import { NextRequest, NextResponse } from "next/server";

// 内存模拟密钥数据
let mockSecrets = [
  { id: "sec_1", name: "OpenAI API Key", type: "API Key", createdAt: "2026-06-01", lastUsedAt: "2026-06-20 18:24", scope: ["read", "write"] },
  { id: "sec_2", name: "GitHub Token", type: "Token", createdAt: "2026-06-10", lastUsedAt: "2026-06-18 10:11", scope: ["read"] }
];

export async function GET() {
  return NextResponse.json(mockSecrets);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, type, value, scope } = body;

    if (!name || !type || !value) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const newSecret = {
      id: `sec_${Date.now()}`,
      name,
      type,
      createdAt: new Date().toISOString().split("T")[0],
      lastUsedAt: "未使用",
      scope: scope || ["read"]
    };

    mockSecrets.push(newSecret);

    // 返回成功，并且把创建的值显示一次（模拟一次性获取）
    return NextResponse.json({
      success: true,
      secret: newSecret,
      value: value // 回传值，让前端只在创建成功的 Modal 里面显示一次
    });
  } catch (error) {
    return NextResponse.json({ error: "创建密钥失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (id) {
      mockSecrets = mockSecrets.filter(item => item.id !== id);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
