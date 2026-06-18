import { describe, it, expect, vi } from "vitest";
import { runHarnessEvaluation } from "../harness";
import { checkPolicy, checkPolicySync } from "../policy";
import {
  generateHarnessProposals,
  approveHarnessProposal,
  rejectHarnessProposal,
  rollbackHarnessProposal,
  promoteCanaryToActive,
} from "../handlers/harness-handler";

// ==============================
// 测试工具：可控的 prisma mock
// ==============================
function makePrismaMock(overrides: Partial<Record<string, any>> = {}) {
  const base = {
    workspace: {
      findUnique: vi.fn(async () => ({ automationLevel: "L2" })),
    },
    workspaceSettings: {
      findUnique: vi.fn(async () => null),
    },
    agentLog: {
      groupBy: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    workflowRun: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => null),
    },
    auditLog: {
      count: vi.fn(async () => 0),
      create: vi.fn(async () => ({})),
    },
    harnessProposal: {
      create: vi.fn(async ({ data }: any) => ({
        id: "cm_proposal_" + Math.random().toString(36).slice(2, 8),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ data }: any) => ({
        id: "cm_updated",
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },
  };
  return { ...base, ...overrides } as any;
}

// ==============================
// PART A：runHarnessEvaluation
// ==============================
describe("runHarnessEvaluation", () => {
  it("无任何信号时返回空结果且不调用 LLM", async () => {
    const prisma = makePrismaMock();
    const callLlm = vi.fn(async () => "[]");
    const out = await runHarnessEvaluation(
      { workspaceId: "ws-1" },
      { prisma, callLlm },
    );
    expect(out.results).toHaveLength(0);
    expect(out.anomalies).toBe(0);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("有信号时调用 LLM 并解析返回结构化结果", async () => {
    const prisma = makePrismaMock({
      agentLog: {
        groupBy: vi.fn(async () => [
          { agentId: "agent-A", _count: { _all: 3 } },
        ]),
        findFirst: vi.fn(async () => ({ detail: "tool timeout", taskName: "x" })),
      },
      workflowRun: {
        count: vi.fn(async () => 2),
        findFirst: vi.fn(async () => ({
          errorMessage: "step 3 failed",
          error: null,
          workflowId: "wf-1",
        })),
      },
    });
    const callLlm = vi.fn(async (_sys: string, _usr: string) =>
      JSON.stringify([
        {
          signal_type: "workflow_failure",
          severity: "high",
          suggestion: "增加超时重试",
          proposalType: "workflow_template",
        },
      ]),
    );
    const out = await runHarnessEvaluation(
      { workspaceId: "ws-1", windowHours: 6 },
      { prisma, callLlm },
    );
    expect(callLlm).toHaveBeenCalledOnce();
    expect(out.results).toHaveLength(1);
    expect(out.results[0].severity).toBe("high");
    expect(out.results[0].proposalType).toBe("workflow_template");
    expect(out.anomalies).toBe(1);
  });

  it("LLM 返回包裹在 ```json 代码块中也能解析", async () => {
    const prisma = makePrismaMock({
      workflowRun: {
        count: vi.fn(async () => 1),
        findFirst: vi.fn(async () => ({ errorMessage: "boom" })),
      },
    });
    const callLlm = vi.fn(
      async () =>
        '```json\n[{"signal_type":"workflow_failure","severity":"medium","suggestion":"调整重试","proposalType":"workflow_template"}]\n```',
    );
    const out = await runHarnessEvaluation(
      { workspaceId: "ws-1" },
      { prisma, callLlm },
    );
    expect(out.results).toHaveLength(1);
    expect(out.results[0].suggestion).toBe("调整重试");
  });

  it("LLM 调用抛错时按原始信号生成兜底提案", async () => {
    const prisma = makePrismaMock({
      workflowRun: {
        count: vi.fn(async () => 5),
        findFirst: vi.fn(async () => ({ errorMessage: "boom" })),
      },
    });
    const callLlm = vi.fn(async () => {
      throw new Error("LLM unavailable");
    });
    const out = await runHarnessEvaluation(
      { workspaceId: "ws-1" },
      { prisma, callLlm },
    );
    expect(out.results.length).toBeGreaterThan(0);
    // count=5 → severity=high
    expect(out.anomalies).toBeGreaterThanOrEqual(1);
  });
});

// ==============================
// PART B：checkPolicy 矩阵
// ==============================
describe("checkPolicy", () => {
  it("L2 + low → allowed", async () => {
    const r = await checkPolicy(
      { workspaceId: "ws-1", action: "test", riskLevel: "low" },
      { prisma: makePrismaMock() },
    );
    expect(r.allowed).toBe(true);
    expect(r.requiresApproval).toBe(false);
    expect(r.level).toBe("L2");
  });

  it("L2 + medium → 需要确认（allowed=true, requiresApproval=false, reason=请确认）", async () => {
    const r = await checkPolicy(
      { workspaceId: "ws-1", action: "send", riskLevel: "medium" },
      { prisma: makePrismaMock() },
    );
    expect(r.allowed).toBe(true);
    expect(r.requiresApproval).toBe(false);
    expect(r.reason).toBe("请确认");
  });

  it("L2 + high → 需审批（allowed=false, requiresApproval=true）", async () => {
    const r = await checkPolicy(
      { workspaceId: "ws-1", action: "delete", riskLevel: "high" },
      { prisma: makePrismaMock() },
    );
    expect(r.allowed).toBe(false);
    expect(r.requiresApproval).toBe(true);
  });

  it("L2 + critical → 阻断", async () => {
    const r = await checkPolicy(
      { workspaceId: "ws-1", action: "wipe", riskLevel: "critical" },
      { prisma: makePrismaMock() },
    );
    expect(r.allowed).toBe(false);
    expect(r.requiresApproval).toBe(false);
    expect(r.reason).toBe("超出当前自动化等级");
  });

  it("L3 + medium → 需审批", async () => {
    const r = await checkPolicy(
      {
        workspaceId: "ws-1",
        action: "auto-update",
        riskLevel: "medium",
        automationLevel: "L3",
      },
      { prisma: makePrismaMock() },
    );
    expect(r.allowed).toBe(false);
    expect(r.requiresApproval).toBe(true);
    expect(r.level).toBe("L3");
  });

  it("L4 + low → 需要确认（最高等级也保留人类否决权）", async () => {
    const r = await checkPolicy(
      {
        workspaceId: "ws-1",
        action: "noop",
        riskLevel: "low",
        automationLevel: "L4",
      },
      { prisma: makePrismaMock() },
    );
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe("请确认");
  });

  it("Workspace.automationLevel 缺失时降级为 L2", async () => {
    const prisma = makePrismaMock({
      workspace: { findUnique: vi.fn(async () => null) },
    });
    const r = await checkPolicy(
      { workspaceId: "ws-1", action: "x", riskLevel: "medium" },
      { prisma },
    );
    expect(r.level).toBe("L2");
    expect(r.reason).toBe("请确认");
  });

  it("checkPolicySync 与 DB 路径裁决一致", () => {
    // high + L1 = confirm
    expect(checkPolicySync("high", "L1").allowed).toBe(true);
    expect(checkPolicySync("high", "L1").reason).toBe("请确认");
    // high + L3 = blocked
    expect(checkPolicySync("high", "L3").requiresApproval).toBe(false);
    expect(checkPolicySync("high", "L3").allowed).toBe(false);
    expect(checkPolicySync("high", "L3").reason).toBe("超出当前自动化等级");
  });
});

// ==============================
// PART C：generateHarnessProposals
// ==============================
describe("generateHarnessProposals", () => {
  it("severity < medium 全被过滤，不写入 DB", async () => {
    const createMock = vi.fn();
    const prisma = makePrismaMock({
      workflowRun: {
        count: vi.fn(async () => 1),
        findFirst: vi.fn(async () => ({ errorMessage: "x" })),
      },
      harnessProposal: { create: createMock },
    });
    const callLlm = vi.fn(async () =>
      JSON.stringify([
        {
          signal_type: "workflow_failure",
          severity: "low",
          suggestion: "noop",
          proposalType: "workflow_template",
        },
      ]),
    );
    const out = await generateHarnessProposals(
      { workspaceId: "ws-1" },
      { prisma, callLlm },
    );
    expect(out.generated).toBe(0);
    expect(out.proposals).toHaveLength(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("severity ≥ medium 时写入 DB 并返回提案", async () => {
    const created: any[] = [];
    const prisma = makePrismaMock({
      workflowRun: {
        count: vi.fn(async () => 4),
        findFirst: vi.fn(async () => ({ errorMessage: "boom" })),
      },
      harnessProposal: {
        create: vi.fn(async ({ data }: any) => {
          const row = {
            id: "cm_" + Math.random().toString(36).slice(2, 8),
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          created.push(row);
          return row;
        }),
      },
    });
    const callLlm = vi.fn(async () =>
      JSON.stringify([
        {
          signal_type: "workflow_failure",
          severity: "high",
          suggestion: "增加幂等重试",
          proposalType: "workflow_template",
        },
        {
          signal_type: "workflow_failure",
          severity: "medium",
          suggestion: "扩大超时窗口",
          proposalType: "workflow_template",
        },
        {
          signal_type: "workflow_failure",
          severity: "low",
          suggestion: "记录到 Trace",
          proposalType: "workflow_template",
        },
      ]),
    );
    const out = await generateHarnessProposals(
      { workspaceId: "ws-1" },
      { prisma, callLlm },
    );
    // medium + high 入库，low 被过滤
    expect(out.generated).toBe(2);
    expect(out.proposals).toHaveLength(2);
    expect(created).toHaveLength(2);

    // 校验 previousSnapshot 已写入
    expect(typeof created[0].previousSnapshot).toBe("string");
    const snap = JSON.parse(created[0].previousSnapshot);
    expect(snap.workspaceId).toBe("ws-1");

    // high 提案：requiresHumanApproval = true
    const highRow = created.find(
      (r) => r.estimatedImpact === "high",
    );
    expect(highRow?.requiresHumanApproval).toBe(true);

    // medium 提案：requiresHumanApproval = false
    const medRow = created.find(
      (r) => r.estimatedImpact === "medium",
    );
    expect(medRow?.requiresHumanApproval).toBe(false);

    // proposedChange.targetComponent 与 proposalType 对应
    expect(created[0].proposedChange.targetComponent).toBe("WorkflowTemplate");

    // proposalId 形如 HEP-...
    expect(created[0].proposalId).toMatch(/^HEP-/);

    // triggeredBy = auto
    expect(created[0].triggeredBy).toBe("auto");
  });

  it("单条 create 失败不影响其他提案写入", async () => {
    let i = 0;
    const prisma = makePrismaMock({
      workflowRun: {
        count: vi.fn(async () => 4),
        findFirst: vi.fn(async () => ({ errorMessage: "boom" })),
      },
      harnessProposal: {
        create: vi.fn(async ({ data }: any) => {
          i += 1;
          if (i === 1) throw new Error("DB constraint");
          return {
            id: "cm_ok",
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }),
      },
    });
    const callLlm = vi.fn(async () =>
      JSON.stringify([
        {
          signal_type: "workflow_failure",
          severity: "high",
          suggestion: "fix1",
          proposalType: "workflow_template",
        },
        {
          signal_type: "workflow_failure",
          severity: "medium",
          suggestion: "fix2",
          proposalType: "workflow_template",
        },
      ]),
    );
    const out = await generateHarnessProposals(
      { workspaceId: "ws-1" },
      { prisma, callLlm },
    );
    expect(out.generated).toBe(1);
    expect(out.proposals).toHaveLength(2);
    expect(out.proposals.some((p: any) => p.status === "create-failed")).toBe(
      true,
    );
  });
});

// ==============================
// SPRINT 2 — PART A：approve 后 Canary 路径
// ==============================
describe("approveHarnessProposal — Canary 路径", () => {
  /** 构造一个 pending 提案（riskLevel 从 proposedChange.riskLevel 读取） */
  function makePendingProposal(riskLevel: string) {
    return {
      id: "prop-1",
      proposalId: "HEP-test",
      workspaceId: "ws-1",
      status: "pending",
      proposedChange: { riskLevel, description: "test", targetComponent: "X", automationLevel: "L2" },
      estimatedImpact: riskLevel,
      canaryConfig: null,
      canaryStartedAt: null,
    };
  }

  it("riskLevel=low → 直接 active，不进入 canary", async () => {
    const auditCreate = vi.fn(async () => ({}));
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => makePendingProposal("low")),
        update: vi.fn(async ({ data }: any) => ({ id: "prop-1", ...data })),
      },
      auditLog: { create: auditCreate },
    });
    const result = await approveHarnessProposal(
      { proposalId: "prop-1", workspaceId: "ws-1", actor: "admin@x.com" },
      { prisma },
    );
    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("active");
    // canaryStartedAt 不应设置
    const updateCall = (prisma.harnessProposal.update.mock.calls as any)[0][0];
    expect(updateCall.data.canaryStartedAt).toBeNull();
  });

  it("riskLevel=medium → 直接 active", async () => {
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => makePendingProposal("medium")),
        update: vi.fn(async ({ data }: any) => ({ id: "prop-1", ...data })),
      },
    });
    const result = await approveHarnessProposal(
      { proposalId: "prop-1", workspaceId: "ws-1", actor: "admin@x.com" },
      { prisma },
    );
    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("active");
  });

  it("riskLevel=high → 进入 canary，status='canary'", async () => {
    const auditCreate = vi.fn(async () => ({}));
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => makePendingProposal("high")),
        update: vi.fn(async ({ data }: any) => ({ id: "prop-1", ...data })),
      },
      auditLog: { create: auditCreate },
    });
    const result = await approveHarnessProposal(
      { proposalId: "prop-1", workspaceId: "ws-1", actor: "admin@x.com" },
      { prisma },
    );
    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("canary");
    expect(result.message).toContain("Canary");
    // canaryStartedAt 应被设置
    const updateCall = (prisma.harnessProposal.update.mock.calls as any)[0][0];
    expect(updateCall.data.canaryStartedAt).toBeInstanceOf(Date);
    // canaryConfig 应被写入
    expect(updateCall.data.canaryConfig).toEqual({
      durationHours: 24,
      successThreshold: 0.95,
    });
  });

  it("riskLevel=critical → 也进入 canary", async () => {
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => makePendingProposal("critical")),
        update: vi.fn(async ({ data }: any) => ({ id: "prop-1", ...data })),
      },
    });
    const result = await approveHarnessProposal(
      { proposalId: "prop-1", workspaceId: "ws-1", actor: "admin@x.com" },
      { prisma },
    );
    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe("canary");
  });

  it("提案不存在时返回错误", async () => {
    const prisma = makePrismaMock();
    const result = await approveHarnessProposal(
      { proposalId: "not-exist", workspaceId: "ws-1", actor: "x" },
      { prisma },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("不存在");
  });

  it("status 不是 pending 时拒绝审批", async () => {
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => ({ ...makePendingProposal("low"), status: "active" })),
      },
    });
    const result = await approveHarnessProposal(
      { proposalId: "prop-1", workspaceId: "ws-1", actor: "x" },
      { prisma },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("不可审批");
  });
});

// ==============================
// SPRINT 2 — PART C：AuditLog 写入
// ==============================
describe("决策操作写入 AuditLog", () => {
  it("approve 写入 auditLog.create", async () => {
    const auditCreate = vi.fn(async () => ({}));
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => ({
          id: "prop-1",
          proposalId: "HEP-1",
          workspaceId: "ws-1",
          status: "pending",
          proposedChange: { riskLevel: "low" },
          estimatedImpact: "low",
          canaryConfig: null,
          canaryStartedAt: null,
        })),
        update: vi.fn(async ({ data }: any) => ({ id: "prop-1", ...data })),
      },
      auditLog: { create: auditCreate },
    });
    await approveHarnessProposal(
      { proposalId: "prop-1", workspaceId: "ws-1", actor: "admin@x.com" },
      { prisma },
    );
    expect(auditCreate).toHaveBeenCalledOnce();
    const auditData = (auditCreate.mock.calls as any)[0][0].data;
    expect(auditData.action).toBe("proposal.approve");
    expect(auditData.actor).toBe("admin@x.com");
    expect(auditData.targetType).toBe("proposal");
    expect(auditData.targetId).toBe("prop-1");
    const detail = JSON.parse(auditData.detail);
    expect(detail.before).toBe("pending");
    expect(detail.after).toBe("active");
  });

  it("reject 写入 auditLog.create", async () => {
    const auditCreate = vi.fn(async () => ({}));
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => ({
          id: "prop-1",
          proposalId: "HEP-1",
          workspaceId: "ws-1",
          status: "pending",
          proposedChange: { riskLevel: "low" },
          estimatedImpact: "low",
        })),
        update: vi.fn(async ({ data }: any) => ({ id: "prop-1", ...data })),
      },
      auditLog: { create: auditCreate },
    });
    await rejectHarnessProposal(
      { proposalId: "prop-1", workspaceId: "ws-1", actor: "admin@x.com" },
      { prisma },
    );
    expect(auditCreate).toHaveBeenCalledOnce();
    const auditData = (auditCreate.mock.calls as any)[0][0].data;
    expect(auditData.action).toBe("proposal.reject");
    const detail = JSON.parse(auditData.detail);
    expect(detail.before).toBe("pending");
    expect(detail.after).toBe("rejected");
  });

  it("rollback 写入 auditLog.create", async () => {
    const auditCreate = vi.fn(async () => ({}));
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => ({
          id: "prop-1",
          proposalId: "HEP-1",
          workspaceId: "ws-1",
          status: "active",
          proposedChange: { riskLevel: "high" },
          estimatedImpact: "high",
        })),
        update: vi.fn(async ({ data }: any) => ({ id: "prop-1", ...data })),
      },
      auditLog: { create: auditCreate },
    });
    await rollbackHarnessProposal(
      { proposalId: "prop-1", workspaceId: "ws-1", actor: "admin@x.com" },
      { prisma },
    );
    expect(auditCreate).toHaveBeenCalledOnce();
    const auditData = (auditCreate.mock.calls as any)[0][0].data;
    expect(auditData.action).toBe("proposal.rollback");
    const detail = JSON.parse(auditData.detail);
    expect(detail.before).toBe("active");
    expect(detail.after).toBe("rolled-back");
  });

  it("AuditLog 写入失败不阻塞业务", async () => {
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => ({
          id: "prop-1",
          proposalId: "HEP-1",
          workspaceId: "ws-1",
          status: "pending",
          proposedChange: { riskLevel: "low" },
          estimatedImpact: "low",
          canaryConfig: null,
          canaryStartedAt: null,
        })),
        update: vi.fn(async ({ data }: any) => ({ id: "prop-1", ...data })),
      },
      auditLog: {
        create: vi.fn(async () => { throw new Error("audit DB down"); }),
      },
    });
    // 不应抛异常
    const result = await approveHarnessProposal(
      { proposalId: "prop-1", workspaceId: "ws-1", actor: "admin@x.com" },
      { prisma },
    );
    expect(result.ok).toBe(true);
  });
});

// ==============================
// SPRINT 2 — PART A：promoteCanaryToActive
// ==============================
describe("promoteCanaryToActive", () => {
  function makeCanaryProposal(overrides: Record<string, any> = {}) {
    const startedAt = new Date(Date.now() - 25 * 3600_000); // 25h ago，默认已过 24h 观察期
    return {
      id: "prop-canary-1",
      proposalId: "HEP-canary",
      workspaceId: "ws-1",
      status: "canary",
      proposedChange: { riskLevel: "high" },
      estimatedImpact: "high",
      canaryStartedAt: startedAt,
      canaryConfig: { durationHours: 24, successThreshold: 0.95 },
      ...overrides,
    };
  }

  it("canary 期满 + 成功率达标 → 晋级 active", async () => {
    const auditCreate = vi.fn(async () => ({}));
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => makeCanaryProposal()),
        update: vi.fn(async ({ data }: any) => ({ id: "prop-canary-1", ...data })),
      },
      agentLog: {
        findMany: vi.fn(async () => [
          { status: "success" }, { status: "success" }, { status: "success" },
          { status: "success" }, { status: "success" },
        ]),
      },
      auditLog: { create: auditCreate },
    });
    const result = await promoteCanaryToActive(
      { proposalId: "prop-canary-1", workspaceId: "ws-1" },
      { prisma },
    );
    expect(result.outcome).toBe("promoted");
    expect(result.ok).toBe(true);
    expect(result.metrics?.successRate).toBe(1);
    expect(result.metrics?.sampleSize).toBe(5);
    // AuditLog 应写入 proposal.promote
    expect(auditCreate).toHaveBeenCalledOnce();
    const auditData = (auditCreate.mock.calls as any)[0][0].data;
    expect(auditData.action).toBe("proposal.promote");
  });

  it("canary 期满 + 成功率不达标 → 自动回滚", async () => {
    const auditCreate = vi.fn(async () => ({}));
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => makeCanaryProposal()),
        update: vi.fn(async ({ data }: any) => ({ id: "prop-canary-1", ...data })),
      },
      agentLog: {
        findMany: vi.fn(async () => [
          { status: "success" }, { status: "error" }, { status: "success" },
          { status: "error" }, { status: "success" },
        ]),
      },
      auditLog: { create: auditCreate },
    });
    const result = await promoteCanaryToActive(
      { proposalId: "prop-canary-1", workspaceId: "ws-1" },
      { prisma },
    );
    expect(result.outcome).toBe("rolled-back");
    expect(result.metrics?.successRate).toBe(0.6); // 3/5
    // AuditLog 应写入 proposal.rollback
    expect(auditCreate).toHaveBeenCalledOnce();
    const auditData = (auditCreate.mock.calls as any)[0][0].data;
    expect(auditData.action).toBe("proposal.rollback");
  });

  it("canary 期满 + 样本量 < 5 → 自动回滚（样本不足）", async () => {
    const auditCreate = vi.fn(async () => ({}));
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => makeCanaryProposal()),
        update: vi.fn(async ({ data }: any) => ({ id: "prop-canary-1", ...data })),
      },
      agentLog: {
        findMany: vi.fn(async () => [
          { status: "success" }, { status: "success" },
        ]),
      },
      auditLog: { create: auditCreate },
    });
    const result = await promoteCanaryToActive(
      { proposalId: "prop-canary-1", workspaceId: "ws-1" },
      { prisma },
    );
    expect(result.outcome).toBe("rolled-back");
    expect(result.message).toContain("样本量不足");
  });

  it("canary 未到期 → outcome='pending'，不做任何更新", async () => {
    const recentStart = new Date(Date.now() - 2 * 3600_000); // 2h ago
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => makeCanaryProposal({ canaryStartedAt: recentStart })),
        update: vi.fn(async ({ data }: any) => ({ id: "prop-canary-1", ...data })),
      },
      agentLog: {
        findMany: vi.fn(async () => []),
      },
    });
    const result = await promoteCanaryToActive(
      { proposalId: "prop-canary-1", workspaceId: "ws-1" },
      { prisma },
    );
    expect(result.outcome).toBe("pending");
    expect(result.metrics?.elapsedHours).toBeLessThan(24);
    // 不应触发 update
    expect(prisma.harnessProposal.update).not.toHaveBeenCalled();
  });

  it("canary 未到期但 force=true → 按当前指标评估", async () => {
    const recentStart = new Date(Date.now() - 1 * 3600_000); // 1h ago
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => makeCanaryProposal({ canaryStartedAt: recentStart })),
        update: vi.fn(async ({ data }: any) => ({ id: "prop-canary-1", ...data })),
      },
      agentLog: {
        findMany: vi.fn(async () => [
          { status: "success" }, { status: "success" }, { status: "success" },
          { status: "success" }, { status: "success" },
        ]),
      },
    });
    const result = await promoteCanaryToActive(
      { proposalId: "prop-canary-1", workspaceId: "ws-1", force: true },
      { prisma },
    );
    expect(result.outcome).toBe("promoted");
  });

  it("提案不存在 → outcome='skipped'", async () => {
    const prisma = makePrismaMock();
    const result = await promoteCanaryToActive(
      { proposalId: "not-exist", workspaceId: "ws-1" },
      { prisma },
    );
    expect(result.outcome).toBe("skipped");
    expect(result.ok).toBe(false);
  });

  it("status !== 'canary' → outcome='skipped'", async () => {
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => makeCanaryProposal({ status: "active" })),
      },
    });
    const result = await promoteCanaryToActive(
      { proposalId: "prop-canary-1", workspaceId: "ws-1" },
      { prisma },
    );
    expect(result.outcome).toBe("skipped");
  });

  it("canaryStartedAt 缺失 → outcome='skipped'", async () => {
    const prisma = makePrismaMock({
      harnessProposal: {
        findUnique: vi.fn(async () => makeCanaryProposal({ canaryStartedAt: null })),
      },
    });
    const result = await promoteCanaryToActive(
      { proposalId: "prop-canary-1", workspaceId: "ws-1" },
      { prisma },
    );
    expect(result.outcome).toBe("skipped");
    expect(result.message).toContain("起始时间缺失");
  });
});

// ==============================================================
// SPRINT 3 — 端到端集成场景验证（5 个场景）
// ==============================================================
describe("Sprint 3 E2E 场景验证", () => {
  // ==============================
  // 场景 A：AI 评估 → 提案生成
  // ==============================
  describe("场景 A：AI 评估 → 提案生成", () => {
    it("runHarnessEvaluation + generateHarnessProposals 全流程返回非空提案", async () => {
      const created: any[] = [];
      const prisma = makePrismaMock({
        agentLog: {
          groupBy: vi.fn(async () => [
            { agentId: "agent-X", _count: { _all: 5 } },
          ]),
          findFirst: vi.fn(async () => ({
            detail: "connector timeout",
            taskName: "send-quotation",
          })),
          findMany: vi.fn(async () => []),
        },
        workflowRun: {
          count: vi.fn(async () => 3),
          findFirst: vi.fn(async () => ({
            errorMessage: "step 2 failed",
            error: null,
            workflowId: "wf-1",
          })),
        },
        auditLog: {
          count: vi.fn(async () => 0),
          create: vi.fn(async () => ({})),
        },
        harnessProposal: {
          create: vi.fn(async ({ data }: any) => {
            const row = {
              id: "cm_e2e_" + Math.random().toString(36).slice(2, 8),
              ...data,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            created.push(row);
            return row;
          }),
        },
      });

      const callLlm = vi.fn(async () =>
        JSON.stringify([
          {
            signal_type: "workflow_failure",
            severity: "high",
            suggestion: "增加超时重试与幂等校验",
            proposalType: "workflow_template",
          },
          {
            signal_type: "connector_error",
            severity: "medium",
            suggestion: "优化连接器降级策略",
            proposalType: "connector_policy",
          },
        ]),
      );

      // Step 1: 评估
      const evalResult = await runHarnessEvaluation(
        { workspaceId: "ws-e2e" },
        { prisma, callLlm },
      );
      expect(evalResult.results.length).toBeGreaterThan(0);
      expect(evalResult.anomalies).toBeGreaterThanOrEqual(1);

      // Step 2: 提案生成
      const propResult = await generateHarnessProposals(
        { workspaceId: "ws-e2e" },
        { prisma, callLlm },
      );
      expect(propResult.generated).toBeGreaterThanOrEqual(1);
      // high + medium 两个提案
      expect(propResult.proposals.length).toBeGreaterThanOrEqual(2);

      // 校验 DB 写入
      const highProposal = created.find(
        (p) => p.estimatedImpact === "high",
      );
      expect(highProposal).toBeDefined();
      expect(highProposal.status).toBe("pending");
      expect(highProposal.triggeredBy).toBe("auto");
      expect(highProposal.proposalId).toMatch(/^HEP-/);
      // previousSnapshot 已写入
      expect(typeof highProposal.previousSnapshot).toBe("string");
    });
  });

  // ==============================
  // 场景 B：人工审批 → Canary
  // ==============================
  describe("场景 B：人工审批 → Canary", () => {
    it("riskLevel=high 的提案审批后 status=canary + AuditLog 写入", async () => {
      const auditCreate = vi.fn(async () => ({}));
      const prisma = makePrismaMock({
        harnessProposal: {
          findUnique: vi.fn(async () => ({
            id: "prop-e2e",
            proposalId: "HEP-E2E",
            workspaceId: "ws-e2e",
            status: "pending",
            proposedChange: {
              riskLevel: "high",
              description: "test",
              targetComponent: "X",
              automationLevel: "L2",
            },
            estimatedImpact: "high",
            canaryConfig: null,
            canaryStartedAt: null,
          })),
          update: vi.fn(async ({ data }: any) => ({
            id: "prop-e2e",
            ...data,
          })),
        },
        auditLog: { create: auditCreate },
      });

      const result = await approveHarnessProposal(
        {
          proposalId: "prop-e2e",
          workspaceId: "ws-e2e",
          actor: "admin@test.com",
        },
        { prisma },
      );

      // 状态应为 canary（非 active）
      expect(result.ok).toBe(true);
      expect(result.newStatus).toBe("canary");
      expect(result.message).toContain("Canary");

      // AuditLog 应写入 proposal.approve
      expect(auditCreate).toHaveBeenCalled();
      const auditData = (auditCreate.mock.calls as any)[0][0].data;
      expect(auditData.action).toBe("proposal.approve");
      const detail = JSON.parse(auditData.detail);
      expect(detail.before).toBe("pending");
      expect(detail.after).toBe("canary");
    });

    it("riskLevel=low 的提案审批后直接 active", async () => {
      const prisma = makePrismaMock({
        harnessProposal: {
          findUnique: vi.fn(async () => ({
            id: "prop-low",
            proposalId: "HEP-LOW",
            workspaceId: "ws-e2e",
            status: "pending",
            proposedChange: { riskLevel: "low" },
            estimatedImpact: "low",
            canaryConfig: null,
            canaryStartedAt: null,
          })),
          update: vi.fn(async ({ data }: any) => ({
            id: "prop-low",
            ...data,
          })),
        },
        auditLog: { create: vi.fn(async () => ({})) },
      });

      const result = await approveHarnessProposal(
        {
          proposalId: "prop-low",
          workspaceId: "ws-e2e",
          actor: "admin@test.com",
        },
        { prisma },
      );
      expect(result.newStatus).toBe("active");
    });
  });

  // ==============================
  // 场景 C：Canary 监控 → 自动 Promote
  // ==============================
  describe("场景 C：Canary → 自动 Promote", () => {
    it("canary 期满 + 成功率达标 → promoted + AuditLog", async () => {
      const auditCreate = vi.fn(async () => ({}));
      const startedAt = new Date(Date.now() - 25 * 3600_000); // 25h ago
      const prisma = makePrismaMock({
        harnessProposal: {
          findUnique: vi.fn(async () => ({
            id: "prop-canary",
            proposalId: "HEP-CANARY",
            workspaceId: "ws-e2e",
            status: "canary",
            proposedChange: { riskLevel: "high" },
            estimatedImpact: "high",
            canaryStartedAt: startedAt,
            canaryConfig: { durationHours: 24, successThreshold: 0.95 },
          })),
          update: vi.fn(async ({ data }: any) => ({
            id: "prop-canary",
            ...data,
          })),
        },
        agentLog: {
          findMany: vi.fn(async () => [
            { status: "success" }, { status: "success" }, { status: "success" },
            { status: "success" }, { status: "success" }, { status: "success" },
            { status: "success" }, { status: "success" }, { status: "success" },
            { status: "success" },
          ]),
          // 10/10 = 100% success rate
        },
        auditLog: { create: auditCreate },
      });

      const result = await promoteCanaryToActive(
        { proposalId: "prop-canary", workspaceId: "ws-e2e", actor: "cron" },
        { prisma },
      );

      expect(result.outcome).toBe("promoted");
      expect(result.metrics?.successRate).toBe(1);

      // AuditLog 写入 proposal.promote
      expect(auditCreate).toHaveBeenCalled();
      const auditData = (auditCreate.mock.calls as any)[0][0].data;
      expect(auditData.action).toBe("proposal.promote");
      const detail = JSON.parse(auditData.detail);
      expect(detail.before).toBe("canary");
      expect(detail.after).toBe("active");
    });
  });

  // ==============================
  // 场景 D：Canary 监控 → 自动 Rollback
  // ==============================
  describe("场景 D：Canary → 自动 Rollback", () => {
    it("canary 期满 + 错误率超阈值 → rolled-back + AuditLog", async () => {
      const auditCreate = vi.fn(async () => ({}));
      const startedAt = new Date(Date.now() - 25 * 3600_000);
      const prisma = makePrismaMock({
        harnessProposal: {
          findUnique: vi.fn(async () => ({
            id: "prop-canary-fail",
            proposalId: "HEP-CANARY-FAIL",
            workspaceId: "ws-e2e",
            status: "canary",
            proposedChange: { riskLevel: "high" },
            estimatedImpact: "high",
            canaryStartedAt: startedAt,
            canaryConfig: { durationHours: 24, successThreshold: 0.95 },
          })),
          update: vi.fn(async ({ data }: any) => ({
            id: "prop-canary-fail",
            ...data,
          })),
        },
        agentLog: {
          findMany: vi.fn(async () => [
            { status: "success" }, { status: "error" }, { status: "error" },
            { status: "error" }, { status: "success" }, { status: "error" },
            { status: "success" }, { status: "error" }, { status: "success" },
            { status: "error" },
          ]),
          // 4 success / 10 total = 40% < 95%
        },
        auditLog: { create: auditCreate },
      });

      const result = await promoteCanaryToActive(
        { proposalId: "prop-canary-fail", workspaceId: "ws-e2e", actor: "cron" },
        { prisma },
      );

      expect(result.outcome).toBe("rolled-back");
      expect(result.metrics?.successRate).toBe(0.4);

      // AuditLog 写入 proposal.rollback
      expect(auditCreate).toHaveBeenCalled();
      const auditData = (auditCreate.mock.calls as any)[0][0].data;
      expect(auditData.action).toBe("proposal.rollback");
      const detail = JSON.parse(auditData.detail);
      expect(detail.before).toBe("canary");
      expect(detail.after).toBe("rolled-back");
    });
  });

  // ==============================
  // 场景 E：Policy 裁决拦截
  // ==============================
  describe("场景 E：Policy 裁决拦截", () => {
    it("critical action + L3 workspace → high risk blocked（矩阵: L3+high=blocked）", async () => {
      const prisma = makePrismaMock({
        workspace: {
          findUnique: vi.fn(async () => ({
            automationLevel: "L3",
          })),
        },
      });

      const result = await checkPolicy(
        {
          workspaceId: "ws-e2e",
          action: "trade.send-quotation",
          riskLevel: "high",
        },
        { prisma },
      );

      // L3 + high → blocked（超出当前自动化等级）
      expect(result.allowed).toBe(false);
      expect(result.requiresApproval).toBe(false);
      expect(result.reason).toBe("超出当前自动化等级");
      expect(result.level).toBe("L3");
    });

    it("critical action + L3 workspace → medium risk requires approval（矩阵: L3+medium=approval）", async () => {
      const prisma = makePrismaMock({
        workspace: {
          findUnique: vi.fn(async () => ({
            automationLevel: "L3",
          })),
        },
      });

      const result = await checkPolicy(
        {
          workspaceId: "ws-e2e",
          action: "trade.send-quotation",
          riskLevel: "medium",
        },
        { prisma },
      );

      // L3 + medium → needs approval
      expect(result.allowed).toBe(false);
      expect(result.requiresApproval).toBe(true);
      expect(result.level).toBe("L3");
    });

    it("critical action + L2 workspace → needs approval", async () => {
      const prisma = makePrismaMock();
      const result = await checkPolicy(
        {
          workspaceId: "ws-e2e",
          action: "trade.sign-contract",
          riskLevel: "high",
        },
        { prisma },
      );
      expect(result.allowed).toBe(false);
      expect(result.requiresApproval).toBe(true);
    });

    it("critical action + L4 workspace → blocked", async () => {
      const prisma = makePrismaMock({
        workspace: {
          findUnique: vi.fn(async () => ({
            automationLevel: "L4",
          })),
        },
      });
      const result = await checkPolicy(
        {
          workspaceId: "ws-e2e",
          action: "trade.send-quotation",
          riskLevel: "high",
        },
        { prisma },
      );
      expect(result.allowed).toBe(false);
      expect(result.requiresApproval).toBe(false);
      expect(result.reason).toBe("超出当前自动化等级");
    });

    it("non-critical action + L2 → allowed or confirm", async () => {
      const prisma = makePrismaMock();
      const result = await checkPolicy(
        {
          workspaceId: "ws-e2e",
          action: "trade.handle-inquiry",
          riskLevel: "low",
        },
        { prisma },
      );
      expect(result.allowed).toBe(true);
    });
  });
});
