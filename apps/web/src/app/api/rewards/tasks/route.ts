import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserRewards, completeRewardTask, type RewardTaskId } from "@/lib/server/credit-service";
import { buildWorkspaceContext } from "@/lib/workspace";
import { createAuditEntry, updateAuditEntry } from "@/lib/server/audit";

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
    const { taskId, idempotencyKey } = body;
    if (!taskId) {
      return NextResponse.json({ error: "请指定任务 ID" }, { status: 400 });
    }

    const ctx = await buildWorkspaceContext(req);

    // 1. 二阶段审计：创建预记录审计日志
    const auditEntry = await createAuditEntry({
      actor: session.user.email || session.user.id,
      action: "reward.task.completed",
      targetType: "reward",
      targetId: taskId,
      detail: `发起完成任务: ${taskId}`,
      workspaceId: ctx.workspaceId,
      riskLevel: "low",
    });

    try {
      const result = await completeRewardTask(session.user.id, ctx.workspaceId, taskId as RewardTaskId);

      if (!result.success) {
        // 如果是已领取的幂等重入，直接返回 success 200 并将审计标记为成功
        if (result.error === "该任务已完成，不能重复领取") {
          await updateAuditEntry({
            auditId: auditEntry.auditId,
            status: "success",
            detail: `完成任务: ${taskId}（幂等校验已存在，不重复领分）` + (idempotencyKey ? ` (IdempKey: ${idempotencyKey})` : ""),
          });
          return NextResponse.json({ success: true, points: 0, isIdempotent: true });
        }

        await updateAuditEntry({
          auditId: auditEntry.auditId,
          status: "failed",
          detail: `完成任务失败: ${result.error || "未知验证失败"}`,
        });
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      // 2. 更新审计状态为成功
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "success",
        detail: `完成任务获得 ${result.points} 积分` + (idempotencyKey ? ` (IdempKey: ${idempotencyKey})` : ""),
      });

      return NextResponse.json({ success: true, points: result.points });
    } catch (err: any) {
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "failed",
        detail: `完成任务失败异常: ${err.message || "未知异常"}`
      });
      throw err;
    }
  } catch (error) {
    console.error("Failed to complete reward task:", error);
    return NextResponse.json({ error: "完成任务失败" }, { status: 500 });
  }
}
