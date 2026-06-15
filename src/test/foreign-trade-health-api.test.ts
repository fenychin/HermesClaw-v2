import { describe, it, expect, vi } from "vitest";
import { getIndustryHealthData } from "@/lib/server/industry-health";
import type { IndustryHealthDeps } from "@/lib/server/industry-health";

describe("getIndustryHealthData — 行业包健康度查询通用化", () => {
  it("应将 packId 入参映射为 Workflow.industryId 过滤条件，并精准查询关联运行记录", async () => {
    // 1. 模拟 Prisma 依赖
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
      workflow: { findMany: mockWorkflowFindMany },
      workflowRun: { findMany: mockWorkflowRunFindMany },
      workflowNodeRun: { findMany: mockWorkflowNodeRunFindMany },
      evolutionLog: { findMany: mockEvolutionLogFindMany },
      auditLog: { findMany: mockAuditLogFindMany },
    } as any;

    const deps: IndustryHealthDeps = { prisma: mockPrisma };

    // 2. 调用通用核心：packId="foreign-trade"
    const result = await getIndustryHealthData("foreign-trade", "test-workspace", deps);

    // 3. 校验工作流过滤参数：industryId 由 packId 入参派生，不是字面量硬编码
    expect(mockWorkflowFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "test-workspace",
        industryId: "foreign-trade",
      },
      select: { id: true },
    });

    // 4. 校验最近运行查询使用查出的工作流 ID
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

  it("当传入不同 packId 时应反映在 industryId 过滤上（行业无关性证据）", async () => {
    const mockWorkflowFindMany = vi.fn().mockResolvedValue([]);
    const mockPrisma = {
      workflow: { findMany: mockWorkflowFindMany },
      workflowRun: { findMany: vi.fn().mockResolvedValue([]) },
      workflowNodeRun: { findMany: vi.fn().mockResolvedValue([]) },
      evolutionLog: { findMany: vi.fn().mockResolvedValue([]) },
      auditLog: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;

    await getIndustryHealthData("retail-pack", "test-workspace", { prisma: mockPrisma });

    expect(mockWorkflowFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "test-workspace", industryId: "retail-pack" },
      select: { id: true },
    });
  });
});
