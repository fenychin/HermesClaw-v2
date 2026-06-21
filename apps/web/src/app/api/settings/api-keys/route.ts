import { NextRequest, NextResponse } from "next/server";

// 内存模拟 API 密钥
let mockApiKeys = [
  { id: "key_1", name: "Production Gateway", prefix: "hc_prod_a1b2c3d4", permission: "admin", createdAt: "2026-05-20", lastUsedAt: "2026-06-20 09:12" },
  { id: "key_2", name: "Leon Webhook Key", prefix: "hc_webhook_e5f6g7h8", permission: "read", createdAt: "2026-06-15", lastUsedAt: "2026-06-19 14:45" }
];

export async function GET() {
  return NextResponse.json(mockApiKeys);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, permission, expiresAt } = body;

    if (!name || !permission) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    // 生成一次性明文 API 密钥
    const rawKey = `hc_${permission}_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    const newKey = {
      id: `key_${Date.now()}`,
      name,
      prefix: `${rawKey.substring(0, 12)}...`,
      permission,
      createdAt: new Date().toISOString().split("T")[0],
      lastUsedAt: "未使用",
      expiresAt: expiresAt || "永久"
    };

    mockApiKeys.push(newKey);

    return NextResponse.json({
      success: true,
      apiKey: newKey,
      rawKey // 回传明文供前端展示
    });
  } catch (error) {
    return NextResponse.json({ error: "创建 API 密钥失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (id) {
      mockApiKeys = mockApiKeys.filter(item => item.id !== id);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
