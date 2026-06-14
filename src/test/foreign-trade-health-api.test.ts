import { describe, it, expect, vi } from "vitest";
import { getForeignTradeHealthData } from "@/lib/server/foreign-trade";
import type { ForeignTradeHealthDeps } from "@/lib/server/foreign-trade";

describe("Foreign Trade Health API 重构精准过滤测试", () => {
  it("应仅过滤出具有 industryId='foreign-trade' 的工作流及其运行记录，完全剔除中文模糊搜索与静态 ID 硬编码", async () => {
    // 1. 模拟 Prisma 依赖，包括 workflow, workflowRun, workflowNodeRun, evolutionLog, auditLog
    const mockWorkflowFindMany = vi.fn().mockResolvedValue([
      { id: "wf-customer-profile" },
      { id: "wf-inquiry-grading" },
    ]);

    const mockWorkflowRunFindMany = vi.fn().mockResolvedValue([
      {
        id: "run-1",
        workflowId: "wf-customer-profile",
        status: "completed",
        startedAt: new Date("2026-06-13T12:00:00Z"),
        finishedAt: new Date("2026-06-13T12:05:00Z"),
        error: null,
      },
    ]);

    const mockWorkflowNodeRunFindMany = vi.fn().mockResolvedValue([]);
    const mockEvolutionLogFindMany = vi.fn().mockResolvedValue([]);
    const mockAuditLogFindMany = vi.fn().mockResolvedValue([]);

    const mockPrisma = {
      workflow: {
        findMany: mockWorkflowFindMany,
      },
      workflowRun: {
        findMany: mockWorkflowRunFindMany,
      },
      workflowNodeRun: {
        findMany: mockWorkflowNodeRunFindMany,
      },
      evolutionLog: {
        findMany: mockEvolutionLogFindMany,
      },
      auditLog: {
        findMany: mockAuditLogFindMany,
      },
    } as any;

    const deps: ForeignTradeHealthDeps = {
      prisma: mockPrisma,
    };

    // 2. 调用核心逻辑处理函数
    const result = await getForeignTradeHealthData("test-workspace", deps);

    // 3. 校验工作流过滤参数：必须基于 industryId: "foreign-trade"
    expect(mockWorkflowFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "test-workspace",
        industryId: "foreign-trade",
      },
      select: { id: true },
    });

    // 4. 校验最近运行查询：必须精准使用查出的工作流 ID，没有任何静态 ID 混入
    expect(mockWorkflowRunFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "test-workspace",
        workflowId: { in: ["wf-customer-profile", "wf-inquiry-grading"] },
      },
      orderBy: { startedAt: "desc" },
      take: 20,
    });

    // 5. 校验返回的数据结构和纯函数计算的统计结果
    expect(result.successRate).toBe(1);
    expect(result.errorRate).toBe(0);
    expect(result.totalRuns).toBe(1);
    expect(result.recentRuns).toHaveLength(1);
    expect(result.recentRuns[0].id).toBe("run-1");
  });
});
