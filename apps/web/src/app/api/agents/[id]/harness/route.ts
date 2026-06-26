/**
 * GET /api/agents/[id]/harness — Harness 快照列表
 *
 * 返回该 Agent 关联的 HarnessSnapshot 数组，供详情页 Harness Tab 渲染版本时间线。
 * 每条快照包含 id、snapshotId、status、snapshotType、createdAt、createdBy 等字段。
 */
import { prisma } from "@/lib/prisma";
import { withRBAC, type RouteContext } from "@/lib/server/api-handler";
import type { WorkspaceContext } from "@/lib/workspace";
import { ApiResponse } from "@/lib/server/api-response";
import { logger } from "@/lib/logger";

interface SnapshotItem {
  snapshotId: string;
  status: string;          // active | superseded | rolled-back-to
  snapshotType: string;    // pre-canary | pre-active | manual | scheduled
  policySnapshotVersion: string;
  createdAt: string;
  createdBy: string;
  restoredAt: string | null;
  restoredBy: string | null;
  /** 摘要信息：技能绑定数、连接器绑定数，供前端快速展示 diff */
  summary: {
    skillCount: number;
    connectorCount: number;
    canDoCount: number;
    cannotDoCount: number;
    automationLevel: string;
  };
}

export const GET = withRBAC(
  async (
    _req: Request,
    ctx: WorkspaceContext,
    routeCtx: RouteContext<{ id: string }>,
  ) => {
    try {
      const { id: agentId } = await routeCtx.params;

      // 验证 Agent 存在
      const agent = await prisma.agent.findUnique({
        where: { id: agentId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      if (!agent) {
        return ApiResponse.error("智能体不存在", 404);
      }

      const snapshots = await prisma.harnessSnapshot.findMany({
        where: { agentId, workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      const items: SnapshotItem[] = snapshots.map((s) => {
        const config = (s.agentConfig ?? {}) as Record<string, unknown>;
        const skillBindings = (s.skillBindings ?? []) as unknown[];
        const connectorBindings = (s.connectorBindings ?? []) as unknown[];
        const canDo = (config as { canDo?: unknown[] }).canDo ?? [];
        const cannotDo = (config as { cannotDo?: unknown[] }).cannotDo ?? [];
        const level = ((config as { automationLevel?: string }).automationLevel
          ?? "L2") as string;

        return {
          snapshotId: s.snapshotId,
          status: s.status,
          snapshotType: s.snapshotType,
          policySnapshotVersion: s.policySnapshotVersion,
          createdAt: s.createdAt.toISOString(),
          createdBy: s.createdBy,
          restoredAt: s.restoredAt?.toISOString() ?? null,
          restoredBy: s.restoredBy ?? null,
          summary: {
            skillCount: Array.isArray(skillBindings) ? skillBindings.length : 0,
            connectorCount: Array.isArray(connectorBindings)
              ? connectorBindings.length
              : 0,
            canDoCount: Array.isArray(canDo) ? canDo.length : 0,
            cannotDoCount: Array.isArray(cannotDo) ? cannotDo.length : 0,
            automationLevel: level,
          },
        };
      });

      return ApiResponse.ok({ snapshots: items });
    } catch (error) {
      logger.error("GET /api/agents/[id]/harness: 失败", {
        error: error instanceof Error ? error.message : "未知错误",
      });
      return ApiResponse.error("加载 Harness 快照失败", 500);
    }
  },
  "VIEWER",
);