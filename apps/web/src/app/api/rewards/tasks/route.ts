/**
 * Rewards Tasks API — 获取奖励任务状态 + 完成任务
 * Phase 2: 真实 Prisma 实现（替换旧 mock）
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserRewards, completeRewardTask, type RewardTaskId } from "@/lib/server/credit-service";
import { buildWorkspaceContext } from "@/lib/workspace";
import { writeAuditLog } from "@/lib/server/audit";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const tasks = await getUserRewards(session.user.id);
    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Failed to fetch reward tasks:", error);
    return NextResponse.json({ error: "获取任务失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { taskId } = body;
    if (!taskId) {
      return NextResponse.json({ error: "请指定任务 ID" }, { status: 400 });
    }

    const ctx = await buildWorkspaceContext(req);
    const result = await completeRewardTask(session.user.id, ctx.workspaceId, taskId as RewardTaskId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // 审计留痕
    await writeAuditLog({
      actor: session.user.email || session.user.id,
      action: "reward.task.completed",
      targetType: "reward",
      targetId: taskId,
      detail: `完成任务获得 ${result.points} 积分`,
      workspaceId: ctx.workspaceId,
    });

    return NextResponse.json({ success: true, points: result.points });
  } catch (error) {
    console.error("Failed to complete reward task:", error);
    return NextResponse.json({ error: "完成任务失败" }, { status: 500 });
  }
}
