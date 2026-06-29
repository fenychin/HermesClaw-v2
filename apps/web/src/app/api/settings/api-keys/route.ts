/**
 * API Keys API — API 密钥管理
 * Phase 2: 真实 crypto.randomUUID + bcrypt hash + Prisma 持久化
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listApiKeys, createApiKey, deleteApiKey } from "@/lib/server/settings-service";
import { writeAuditLog } from "@/lib/server/audit";
import { buildWorkspaceContext } from "@/lib/workspace";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const keys = await listApiKeys(session.user.id);
    return NextResponse.json(keys);
  } catch {
    return NextResponse.json({ error: "获取 API 密钥列表失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, permission, expiresAt } = body;
    if (!name || !permission) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const apiKey = await createApiKey(session.user.id, { name, permission, expiresAt });

    try {
      const ctx = await buildWorkspaceContext(req);
      await writeAuditLog({
        actor: session.user.email || session.user.id,
        action: "api_key.created",
        targetType: "api_key",
        targetId: apiKey.id,
        detail: `创建 API 密钥: ${name}`,
        workspaceId: ctx.workspaceId,
      });
    } catch { /* 审计非致命 */ }

    const { rawKey, ...apiKeyData } = apiKey;

    return NextResponse.json({
      success: true,
      apiKey: {
        ...apiKeyData,
        createdAt: new Date().toISOString().split("T")[0],
        lastUsedAt: "从未",
        expiresAt: expiresAt || "永久",
      },
      rawKey,
    });
  } catch (error) {
    console.error("Failed to create API key:", error);
    return NextResponse.json({ error: "创建 API 密钥失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少密钥 ID" }, { status: 400 });

    await deleteApiKey(session.user.id, id);

    try {
      const ctx = await buildWorkspaceContext(req);
      await writeAuditLog({
        actor: session.user.email || session.user.id,
        action: "api_key.deleted",
        targetType: "api_key",
        targetId: id,
        detail: "删除 API 密钥",
        workspaceId: ctx.workspaceId,
      });
    } catch { /* 审计非致命 */ }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete API key:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
