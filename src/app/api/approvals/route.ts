import { withRBAC } from "@/lib/server/api-handler";
import { expireStaleCheckpoints } from "@/lib/server/approval";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/approvals
 * 获取当前工作空间下的审批检查点列表（支持 status 筛选与分页）
 */
export const GET = withRBAC(async (request, ctx) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "pending";
  
  const pageStr = searchParams.get("page");
  const limitStr = searchParams.get("limit") || searchParams.get("pageSize");
  
  const page = pageStr ? parseInt(pageStr, 10) : 1;
  const limit = limitStr ? parseInt(limitStr, 10) : 20;

  const validPage = (isNaN(page) || page < 1) ? 1 : page;
  const validLimit = (isNaN(limit) || limit < 1) ? 20 : limit;
  const skip = (validPage - 1) * validLimit;

  // 1. 自动巡检并过期已超时的 pending 记录
  await expireStaleCheckpoints(ctx.workspaceId);

  // 2. 构造查询 where 条件
  const whereClause: any = {
    workspaceId: ctx.workspaceId,
  };

  if (status !== "all") {
    whereClause.decision = status;
  }

  // 3. 排序及分页查询
  const [records, total] = await Promise.all([
    prisma.approvalCheckpoint.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip,
      take: validLimit,
    }),
    prisma.approvalCheckpoint.count({
      where: whereClause,
    }),
  ]);

  // 4. 批量回溯 AuditLog 以解析 requestedBy
  const checkpointIds = records.map((r) => r.checkpointId);
  const auditLogs = checkpointIds.length > 0 ? await prisma.auditLog.findMany({
    where: {
      action: "approval.requested",
      targetId: { in: checkpointIds },
    },
    select: {
      targetId: true,
      actor: true,
    },
  }) : [];

  const logMap = new Map(auditLogs.map((log) => [log.targetId, log.actor]));

  // 5. 格式化数据并注入 actionType, remainingMs 等字段
  const now = Date.now();
  const checkpoints = records.map((record) => {
    let actionType = record.actionSummary;
    if (record.triggerReason === "eval.proposal.generated") {
      actionType = "工作流升级提案";
    } else if (record.actionSummary.includes("：")) {
      const parts = record.actionSummary.split("：");
      actionType = parts[1] || record.actionSummary;
    } else if (record.actionSummary.includes(":")) {
      const parts = record.actionSummary.split(":");
      actionType = parts[1] || record.actionSummary;
    }

    const remainingMs = Math.max(0, new Date(record.expiresAt).getTime() - now);

    return {
      id: record.checkpointId, // 数据库里 decide/接口的 id 接收的是 checkpointId
      checkpointId: record.checkpointId,
      taskId: record.taskId ?? undefined,
      workflowRunId: record.workflowRunId ?? undefined,
      proposalId: record.proposalId ?? undefined,
      riskLevel: record.riskLevel,
      automationLevel: record.automationLevel,
      actionType,
      actionSummary: record.actionSummary,
      status: record.decision,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      requestedBy: logMap.get(record.checkpointId) || "system",
      remainingMs,
    };
  });

  return Response.json({
    success: true,
    data: {
      checkpoints,
      total,
    },
  });
}, "VIEWER");

