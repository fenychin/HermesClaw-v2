/**
 * POST /api/harness/proposals/[id]/rollback — 提案回滚
 *
 * 增强逻辑（F-1）：
 * 1. 验证 status 为 'canary' 或 'active'
 * 2. 读取 previousSnapshot 将其内容还原（由 kernel 完成）
 * 3. 更新 status → 'rolled_back'，写 rolledBackAt
 * 4. 写 AuditLog: action='harness.rollback.executed', reason
 */
import { prisma } from "@/lib/prisma";
import { withRBAC, type RouteContext } from "@/lib/server/api-handler";
import { actorFromSession } from "@/lib/server/audit";
import type { WorkspaceContext } from "@/lib/workspace";
import { ApiResponse } from "@/lib/server/api-response";
import { rollbackHarnessProposal } from "@hermesclaw/hermes-kernel";
import { z } from "zod";
import { validateBody } from "@/lib/server/validators";
import { logger } from "@/lib/logger";

const RollbackRequestSchema = z.object({
  operatorId: z.string().optional(),
  reason: z.string().optional(),
  confirmationToken: z.string().optional(),
});
const L3_TOKEN = process.env["HARNESS_L3_CONFIRMATION_TOKEN"] ?? "确认回滚";

export const POST = withRBAC(
  async (
    req: Request,
    ctx: WorkspaceContext,
    routeCtx: RouteContext<{ id: string }>,
  ) => {
    try {
      const { id } = await routeCtx.params;
      const parsed = validateBody(
        await req.json().catch(() => ({})),
        RollbackRequestSchema,
      );
      if (parsed instanceof Response) return parsed;

      const queryWhere = id.startsWith("HEP-")
        ? { proposalId: id, workspaceId: ctx.workspaceId }
        : { id, workspaceId: ctx.workspaceId };

      const proposal = await prisma.harnessProposal.findFirst({
        where: queryWhere,
        select: {
          id: true,
          proposalId: true,
          status: true,
          proposedChange: true,
        },
      });
      if (!proposal) return ApiResponse.error("提案不存在", 404);

      // L3/L4 门禁保留
      const changeMeta = (proposal.proposedChange ?? {}) as {
        riskLevel?: string;
        automationLevel?: string;
      };
      const automationLevel =
        (changeMeta.automationLevel as string) ?? "L2";
      if (automationLevel === "L4")
        return ApiResponse.error("L4 级别提案禁止自动执行", 403);
      if (
        automationLevel === "L3" &&
        parsed.confirmationToken !== L3_TOKEN
      ) {
        return Response.json(
          {
            success: false,
            error: "L3 高风险回滚需 confirmationToken",
            requiresConfirmation: true,
          },
          { status: 409 },
        );
      }

      const actor = await actorFromSession();

      // 调用 kernel 回滚逻辑（含 previousSnapshot 还原 + AuditLog 写入）
      const result = await rollbackHarnessProposal(
        {
          proposalId: proposal.id,
          workspaceId: ctx.workspaceId,
          actor,
          reason: parsed.reason ?? parsed.operatorId,
        },
        { prisma },
      );

      if (!result.ok) {
        return ApiResponse.error(result.message, 400);
      }

      // 写 harness.rollback.executed 审计（含 reason）
      await prisma.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          action: "harness.rollback.executed",
          actor,
          targetType: "proposal",
          targetId: proposal.id,
          detail: JSON.stringify({
            reason: parsed.reason ?? parsed.operatorId,
            status: "rolled_back",
          }),
          triggeredBy: "user",
          status: "success",
          createdAt: new Date(),
        },
      }).catch(() => {
        /* 审计写失败不阻塞 */
      });

      return ApiResponse.ok({
        message: "回滚成功",
        proposalId: proposal.proposalId,
        rolledBackAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("POST harness rollback: 失败", {
        error: error instanceof Error ? error.message : "未知错误",
      });
      return ApiResponse.error("回滚失败", 500);
    }
  },
  "ADMIN",
);
