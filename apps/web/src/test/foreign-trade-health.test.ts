import { describe, it, expect } from "vitest";
import { calculateWorkflowHealth } from "@/lib/server/industry-health";
import type { WorkflowRunSummary } from "@/lib/server/industry-health";

describe("calculateWorkflowHealth — 行业包工作流健康度统计纯函数", () => {
  it("应妥善处理空数组边界情况", () => {
    const runs: WorkflowRunSummary[] = [];
    const stats = calculateWorkflowHealth(runs);
    expect(stats.totalRuns).toBe(0);
    expect(stats.successRate).toBe(1);
    expect(stats.errorRate).toBe(0);
    expect(stats.avgDurationMs).toBe(0);
  });

  it("当所有运行成功时，成功率应为 100%", () => {
    const baseTime = new Date("2026-06-13T10:00:00Z");
    const runs: WorkflowRunSummary[] = [
      {
        status: "completed",
        startedAt: baseTime,
        finishedAt: new Date(baseTime.getTime() + 2000), // 2s
      },
      {
        status: "completed",
        startedAt: baseTime,
        finishedAt: new Date(baseTime.getTime() + 4000), // 4s
      },
    ];

    const stats = calculateWorkflowHealth(runs);
    expect(stats.totalRuns).toBe(2);
    expect(stats.successRate).toBe(1);
    expect(stats.errorRate).toBe(0);
    expect(stats.avgDurationMs).toBe(3000); // (2000 + 4000) / 2 = 3000ms
  });

  it("当所有运行失败时，成功率应为 0%", () => {
    const baseTime = new Date("2026-06-13T10:00:00Z");
    const runs: WorkflowRunSummary[] = [
      {
        status: "failed",
        startedAt: baseTime,
        finishedAt: new Date(baseTime.getTime() + 1000),
      },
    ];

    const stats = calculateWorkflowHealth(runs);
    expect(stats.totalRuns).toBe(1);
    expect(stats.successRate).toBe(0);
    expect(stats.errorRate).toBe(1);
  });

  it("在混合运行和异常耗时下，能正确计算并过滤错误数据", () => {
    const baseTime = new Date("2026-06-13T10:00:00Z");
    const runs: WorkflowRunSummary[] = [
      // 成功 (1500ms)
      {
        status: "completed",
        startedAt: baseTime,
        finishedAt: new Date(baseTime.getTime() + 1500),
      },
      // 失败 (2500ms)
      {
        status: "failed",
        startedAt: baseTime,
        finishedAt: new Date(baseTime.getTime() + 2500),
      },
      // 正在运行中 (无 finishedAt，应跳过耗时统计)
      {
        status: "running",
        startedAt: baseTime,
        finishedAt: null,
      },
      // 负值异常数据 (应过滤)
      {
        status: "completed",
        startedAt: baseTime,
        finishedAt: new Date(baseTime.getTime() - 500),
      },
      // 超过一天的超长异常数据 (应过滤)
      {
        status: "completed",
        startedAt: baseTime,
        finishedAt: new Date(baseTime.getTime() + 86400000 + 1000),
      },
    ];

    const stats = calculateWorkflowHealth(runs);
    // 成功完成数为 3 (两个completed，其中包含异常负耗时和超长耗时)，总数为 5
    expect(stats.totalRuns).toBe(5);
    expect(stats.successRate).toBe(3 / 5);
    expect(stats.errorRate).toBe(1 / 5);
    // 有效耗时仅有 1500ms 和 2500ms，平均为 2000ms
    expect(stats.avgDurationMs).toBe(2000);
  });
});
