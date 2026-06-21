/**
 * Secrets API — 加密密钥管理
 * Phase 2: 真实 AES-256-GCM 加密 + Prisma 持久化
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listSecrets, createSecret, deleteSecret } from "@/lib/server/settings-service";
import { writeAuditLog } from "@/lib/server/audit";
import { buildWorkspaceContext } from "@/lib/workspace";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const secrets = await listSecrets(session.user.id);
    return NextResponse.json(secrets);
  } catch {
    return NextResponse.json({ error: "获取密钥列表失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, type, value, scope, workspaceId } = body;
    if (!name || !type || !value) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const secret = await createSecret(session.user.id, { name, type, value, scope, workspaceId });

    // 审计留痕
    try {
      const ctx = await buildWorkspaceContext(req);
      await writeAuditLog({
        actor: session.user.email || session.user.id,
        action: "secret.created",
        targetType: "secret",
        targetId: secret.id,
        detail: `创建密钥: ${name}`,
        workspaceId: ctx.workspaceId,
      });
    } catch { /* 审计非致命 */ }

    return NextResponse.json({ success: true, secret });
  } catch (error) {
    console.error("Failed to create secret:", error);
    return NextResponse.json({ error: "创建密钥失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少密钥 ID" }, { status: 400 });

    await deleteSecret(session.user.id, id);

    try {
      const ctx = await buildWorkspaceContext(req);
      await writeAuditLog({
        actor: session.user.email || session.user.id,
        action: "secret.deleted",
        targetType: "secret",
        targetId: id,
        detail: "删除密钥",
        workspaceId: ctx.workspaceId,
      });
    } catch { /* 审计非致命 */ }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete secret:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
