import { NextResponse } from "next/server";
import { buildWorkspaceContext } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request);
    let body: any = {};
    try {
      body = await request.json();
    } catch {}

    const { agentId, workspaceId } = body;
    if (!agentId || !workspaceId) {
      return NextResponse.json({ success: false, error: "Missing agentId or workspaceId" }, { status: 400 });
    }

    // 查找 Agent 关联 of industryId
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { industryId: true }
    });

    const industryId = agent?.industryId ?? ctx.industryId ?? "foreign-trade";

    const sessionContext = {
      sessionId: crypto.randomUUID(),
      workspaceId,
      agentId,
      industryId,
      createdAt: new Date().toISOString()
    };

    // 双重结构返回，完美兼容 { success, data: context } 与直接 context 结构两种读取假定
    return NextResponse.json({
      success: true,
      data: sessionContext,
      ...sessionContext
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
