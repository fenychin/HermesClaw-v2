import { describe, it, expect, vi } from "vitest";
import {
  canTransition,
  computeCanaryMetrics,
  shouldPromoteCanary,
  DEFAULT_CANARY_THRESHOLDS,
  type HarnessProposalStatus,
} from "../harness/lifecycle";

// ==============================
// canTransition 矩阵（边界值覆盖）
// ==============================
describe("canTransition", () => {
  const ALL_STATUSES: HarnessProposalStatus[] = [
    "draft",
    "pending",
    "approved",
    "canary",
    "active",
    "rejected",
    "rolled_back",
  ];

  // 合法转换
  const VALID: Array<[HarnessProposalStatus, HarnessProposalStatus]> = [
    ["draft", "pending"],
    ["pending", "approved"],
    ["pending", "rejected"],
    ["approved", "canary"],
    ["approved", "rejected"],
    ["canary", "active"],
    ["canary", "rolled_back"],
    ["active", "rolled_back"],
  ];

  for (const [from, to] of VALID) {
    it(`${from} → ${to} 应返回 true`, () => {
      expect(canTransition(from, to)).toBe(true);
    });
  }

  // 非法转换：从每个状态出发，检查所有不应允许的目标
  it("draft → 除 pending 外所有状态应 false", () => {
    for (const to of ALL_STATUSES) {
      if (to === "pending") continue;
      expect(canTransition("draft", to)).toBe(false);
    }
  });

  it("pending → 仅 approved/rejected 应 true", () => {
    for (const to of ALL_STATUSES) {
      const expected = to === "approved" || to === "rejected";
      expect(canTransition("pending", to)).toBe(expected);
    }
  });

  it("approved → 仅 canary/rejected 应 true", () => {
    for (const to of ALL_STATUSES) {
      const expected = to === "canary" || to === "rejected";
      expect(canTransition("approved", to)).toBe(expected);
    }
  });

  it("canary → 仅 active/rolled_back 应 true", () => {
    for (const to of ALL_STATUSES) {
      const expected = to === "active" || to === "rolled_back";
      expect(canTransition("canary", to)).toBe(expected);
    }
  });

  it("active → 仅 rolled_back 应 true", () => {
    for (const to of ALL_STATUSES) {
      expect(canTransition("active", to)).toBe(to === "rolled_back");
    }
  });

  it("rejected → 所有目标应 false（终态）", () => {
    for (const to of ALL_STATUSES) {
      expect(canTransition("rejected", to)).toBe(false);
    }
  });

  it("rolled_back → 所有目标应 false（终态）", () => {
    for (const to of ALL_STATUSES) {
      expect(canTransition("rolled_back", to)).toBe(false);
    }
  });
});

// ==============================
// computeCanaryMetrics
// ==============================
describe("computeCanaryMetrics", () => {
  function makePrismaMock(
    workflowOverrides: Partial<{
      total: number;
      failed: number;
    }> = {},
    connectorOverrides: Partial<{
      total: number;
      failed: number;
    }> = {},
    approvalOverrides: Partial<{
      total: number;
      rejected: number;
    }> = {},
  ) {
    const wfTotal = workflowOverrides.total ?? 10;
    const wfFailed = workflowOverrides.failed ?? 1;
    const connTotal = connectorOverrides.total ?? 5;
    const connFailed = connectorOverrides.failed ?? 0;
    const apprTotal = approvalOverrides.total ?? 4;
    const apprRejected = approvalOverrides.rejected ?? 0;

    let wfCallCount = 0;
    let connCallCount = 0;
    let apprCallCount = 0;
    return {
      workflowRun: {
        count: vi.fn(({ where }: any) => {
          wfCallCount++;
          const s = where?.status;
          if (typeof s === "string" && s === "failed") return Promise.resolve(wfFailed);
          return Promise.resolve(wfCallCount === 1 ? wfTotal : wfFailed);
        }),
      },
      emailSendLog: {
        count: vi.fn(() => {
          connCallCount++;
          return Promise.resolve(connCallCount === 1 ? connTotal : connFailed);
        }),
      },
      approvalCheckpoint: {
        count: vi.fn(() => {
          apprCallCount++;
          return Promise.resolve(apprCallCount === 1 ? apprTotal : apprRejected);
        }),
      },
    } as any;
  }

  it("正常数据下统计正确", async () => {
    const prisma = makePrismaMock(
      { total: 10, failed: 1 },
      { total: 5, failed: 0 },
      { total: 4, rejected: 1 },
    );
    const since = new Date(Date.now() - 24 * 3600_000);
    const metrics = await computeCanaryMetrics(prisma, "ws-1", since);

    expect(metrics.totalRuns).toBe(19); // 10 + 5 + 4
    expect(metrics.workflowSuccessRate).toBe(0.9); // 9/10
    expect(metrics.connectorSuccessRate).toBe(1); // 5/5
    expect(metrics.humanApprovalRate).toBe(0.75); // 3/4
  });

  it("无数据时返回默认值 1", async () => {
    const prisma = makePrismaMock(
      { total: 0, failed: 0 },
      { total: 0, failed: 0 },
      { total: 0, rejected: 0 },
    );
    const since = new Date();
    const metrics = await computeCanaryMetrics(prisma, "ws-1", since);

    expect(metrics.totalRuns).toBe(0);
    expect(metrics.workflowSuccessRate).toBe(1);
    expect(metrics.connectorSuccessRate).toBe(1);
    expect(metrics.humanApprovalRate).toBe(1);
  });

  it("全部失败时 rate 为 0", async () => {
    const prisma = makePrismaMock(
      { total: 5, failed: 5 },
      { total: 3, failed: 3 },
      { total: 2, rejected: 2 },
    );
    const since = new Date();
    const metrics = await computeCanaryMetrics(prisma, "ws-1", since);

    expect(metrics.workflowSuccessRate).toBe(0);
    expect(metrics.connectorSuccessRate).toBe(0);
    expect(metrics.humanApprovalRate).toBe(0);
  });
});

// ==============================
// shouldPromoteCanary
// ==============================
describe("shouldPromoteCanary", () => {
  it("指标全部达标 → true", () => {
    const result = shouldPromoteCanary(
      {
        workflowSuccessRate: 0.95,
        connectorSuccessRate: 0.9,
        humanApprovalRate: 1,
        totalRuns: 100,
      },
    );
    expect(result).toBe(true);
  });

  it("边界值刚好达标 → true", () => {
    const result = shouldPromoteCanary(
      {
        workflowSuccessRate: 0.8,
        connectorSuccessRate: 0.85,
        humanApprovalRate: 0.8,
        totalRuns: 10,
      },
    );
    expect(result).toBe(true);
  });

  it("workflow 未达标 → false", () => {
    const result = shouldPromoteCanary(
      {
        workflowSuccessRate: 0.79,
        connectorSuccessRate: 0.9,
        humanApprovalRate: 1,
        totalRuns: 50,
      },
    );
    expect(result).toBe(false);
  });

  it("connector 未达标 → false", () => {
    const result = shouldPromoteCanary(
      {
        workflowSuccessRate: 0.9,
        connectorSuccessRate: 0.84,
        humanApprovalRate: 1,
        totalRuns: 50,
      },
    );
    expect(result).toBe(false);
  });

  it("两项均未达标 → false", () => {
    const result = shouldPromoteCanary(
      {
        workflowSuccessRate: 0.5,
        connectorSuccessRate: 0.5,
        humanApprovalRate: 0.5,
        totalRuns: 20,
      },
    );
    expect(result).toBe(false);
  });

  it("使用自定义阈值", () => {
    const result = shouldPromoteCanary(
      {
        workflowSuccessRate: 0.7,
        connectorSuccessRate: 0.8,
        humanApprovalRate: 1,
        totalRuns: 10,
      },
      { workflowSuccessRate: 0.7, connectorSuccessRate: 0.75 },
    );
    expect(result).toBe(true);
  });
});
