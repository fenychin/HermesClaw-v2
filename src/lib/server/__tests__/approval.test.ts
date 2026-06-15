import { describe, it, expect, vi, beforeEach } from "vitest";

// ==============================
// Mocks
// ==============================

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    approvalCheckpoint: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    workspace: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    harnessProposal: {
      create: vi.fn(),
    },
  },
}));

// Mock Audit
const mockWriteAuditLog = vi.fn();
vi.mock("@/lib/server/audit", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
  actorFromSession: () => Promise.resolve("test-user"),
}));

// Dynamic Import Mock for approval
const mockCreateApprovalCheckpointSpy = vi.fn();
vi.mock("@/lib/server/approval", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createApprovalCheckpoint: async (...args: unknown[]) => {
      mockCreateApprovalCheckpointSpy(...args);
      const originalCreate = actual['createApprovalCheckpoint'] as (...args: unknown[]) => Promise<unknown>;
      return originalCreate(...args);
    },
  };
});

import {
  createApprovalCheckpoint,
  decideApprovalCheckpoint,
  expireStaleCheckpoints,
  listPendingCheckpoints,
  ApprovalNotFoundError,
  ApprovalAlreadyDecidedError,
  ApprovalExpiredError,
} from "../approval";
import { validateTaskAutomationLevel } from "../guardrail";
import { generateProposal } from "../proposal-engine";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma-v2/client";

describe("Approval Engine Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createApprovalCheckpoint", () => {
    it("should successfully create checkpoint and write audit log", async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const input = {
        taskId: "task-1",
        workspaceId: "ws-1",
        triggerReason: "risk.level.high" as const,
        riskLevel: "high" as const,
        automationLevel: "L3" as const,
        actionSummary: "High risk task execution",
        inputSnapshot: { key: "value" },
        policySnapshotVersion: "v1.0",
        expiresAt,
      };

      const dbRecord = {
        id: "id-123",
        checkpointId: "acp-123",
        workspaceId: "ws-1",
        taskId: "task-1",
        workflowRunId: null,
        proposalId: null,
        decision: "pending",
        triggerReason: "risk.level.high",
        riskLevel: "high",
        automationLevel: "L3",
        actionSummary: "High risk task execution",
        inputSnapshot: { key: "value" },
        policySnapshotVersion: "v1.0",
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCreate.mockResolvedValue(dbRecord);
      mockWriteAuditLog.mockResolvedValue(undefined);

      const result = await createApprovalCheckpoint(input);

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          checkpointId: expect.any(String),
          workspaceId: "ws-1",
          taskId: "task-1",
          workflowRunId: null,
          proposalId: null,
          decision: "pending",
          triggerReason: "risk.level.high",
          riskLevel: "high",
          automationLevel: "L3",
          actionSummary: "High risk task execution",
          inputSnapshot: { key: "value" },
          policySnapshotVersion: "v1.0",
          expiresAt,
        }),
      }));

      expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        actor: "system",
        action: "approval.requested",
        targetType: "approval",
        targetId: expect.any(String),
        detail: "High risk task execution",
        riskLevel: "high",
        workspaceId: "ws-1",
      }));

      expect(result.checkpointId).toBe("acp-123");
      expect(result.decision).toBe("pending");
    });

    it("should use creator as actor in audit log when creator is provided", async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const input = {
        taskId: "task-1",
        workspaceId: "ws-1",
        triggerReason: "risk.level.high" as const,
        riskLevel: "high" as const,
        automationLevel: "L3" as const,
        actionSummary: "High risk task execution",
        inputSnapshot: {},
        policySnapshotVersion: "v1.0",
        expiresAt,
        creator: "user-creator",
      };

      const dbRecord = {
        id: "id-123",
        checkpointId: "acp-123",
        workspaceId: "ws-1",
        taskId: "task-1",
        workflowRunId: null,
        proposalId: null,
        decision: "pending",
        triggerReason: "risk.level.high",
        riskLevel: "high",
        automationLevel: "L3",
        actionSummary: "High risk task execution",
        inputSnapshot: {},
        policySnapshotVersion: "v1.0",
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCreate.mockResolvedValue(dbRecord);

      await createApprovalCheckpoint(input);

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: "user-creator",
          action: "approval.requested",
        })
      );
    });
  });

  describe("decideApprovalCheckpoint", () => {
    it("should approve checkpoint, update DB and write audit log", async () => {
      const expiresAt = new Date(Date.now() + 100000);
      const dbRecord = {
        checkpointId: "acp-123",
        workspaceId: "ws-1",
        decision: "pending",
        triggerReason: "risk.level.high",
        riskLevel: "high",
        automationLevel: "L3",
        actionSummary: "summary",
        inputSnapshot: {},
        policySnapshotVersion: "v1.0",
        expiresAt,
      };

      mockFindUnique.mockResolvedValue(dbRecord);
      mockUpdate.mockResolvedValue({
        ...dbRecord,
        decision: "approved",
        decidedAt: new Date(),
        decidedBy: "user-1",
      });

      const result = await decideApprovalCheckpoint("acp-123", "approved", "user-1");

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { checkpointId: "acp-123" },
        data: {
          decision: "approved",
          decidedAt: expect.any(Date),
          decidedBy: "user-1",
        },
      });

      expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        actor: "user-1",
        action: "approval.granted",
        targetType: "approval",
        targetId: "acp-123",
        detail: "审批决策: [approved]。审批摘要: summary",
        riskLevel: "high",
        workspaceId: "ws-1",
      }));

      expect(result.decision).toBe("approved");
    });

    it("should reject checkpoint, update DB and write audit log", async () => {
      const expiresAt = new Date(Date.now() + 100000);
      const dbRecord = {
        checkpointId: "acp-123",
        workspaceId: "ws-1",
        decision: "pending",
        triggerReason: "risk.level.high",
        riskLevel: "high",
        automationLevel: "L3",
        actionSummary: "summary",
        inputSnapshot: {},
        policySnapshotVersion: "v1.0",
        expiresAt,
      };

      mockFindUnique.mockResolvedValue(dbRecord);
      mockUpdate.mockResolvedValue({
        ...dbRecord,
        decision: "rejected",
        decidedAt: new Date(),
        decidedBy: "user-1",
      });

      const result = await decideApprovalCheckpoint("acp-123", "rejected", "user-1");

      expect(result.decision).toBe("rejected");
      expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        actor: "user-1",
        action: "approval.rejected",
        targetType: "approval",
        targetId: "acp-123",
        detail: "审批决策: [rejected]。审批摘要: summary",
        riskLevel: "high",
        workspaceId: "ws-1",
      }));
    });

    it("should throw ApprovalNotFoundError if checkpoint does not exist", async () => {
      mockFindUnique.mockResolvedValue(null);
      await expect(
        decideApprovalCheckpoint("non-existent", "approved", "user-1")
      ).rejects.toThrow(ApprovalNotFoundError);
    });

    it("should throw ApprovalAlreadyDecidedError if checkpoint is not pending", async () => {
      const dbRecord = {
        checkpointId: "acp-123",
        workspaceId: "ws-1",
        decision: "approved",
        expiresAt: new Date(),
      };
      mockFindUnique.mockResolvedValue(dbRecord);

      await expect(
        decideApprovalCheckpoint("acp-123", "rejected", "user-1")
      ).rejects.toThrow(ApprovalAlreadyDecidedError);
    });

    it("should throw ApprovalExpiredError if checkpoint has expired", async () => {
      const dbRecord = {
        checkpointId: "acp-123",
        workspaceId: "ws-1",
        decision: "pending",
        riskLevel: "high",
        actionSummary: "summary",
        expiresAt: new Date(Date.now() - 10000), // 已过期 10 秒
      };
      mockFindUnique.mockResolvedValue(dbRecord);
      mockUpdate.mockResolvedValue({
        ...dbRecord,
        decision: "expired",
      });

      await expect(
        decideApprovalCheckpoint("acp-123", "approved", "user-1")
      ).rejects.toThrow(ApprovalExpiredError);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { checkpointId: "acp-123" },
        data: { decision: "expired" },
      });

      expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        actor: "system",
        action: "approval.expired",
        targetType: "approval",
        targetId: "acp-123",
        detail: "审批超时失效，已拒绝该审批决策: summary",
        riskLevel: "high",
        workspaceId: "ws-1",
      }));
    });

    it("should successfully parse and save requiredSigners when creating checkpoint", async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const input = {
        taskId: "task-1",
        workspaceId: "ws-1",
        triggerReason: "risk.level.high" as const,
        riskLevel: "high" as const,
        automationLevel: "L3" as const,
        actionSummary: "Multi signer action",
        inputSnapshot: {},
        policySnapshotVersion: "v1.0",
        expiresAt,
        requiredSigners: ["signer1@example.com", "signer2@example.com"],
      };

      const dbRecord = {
        checkpointId: "acp-multi-123",
        workspaceId: "ws-1",
        decision: "pending",
        requiredSigners: JSON.stringify(["signer1@example.com", "signer2@example.com"]),
        signedList: JSON.stringify([]),
        inputSnapshot: {},
        expiresAt,
        triggerReason: "risk.level.high",
        riskLevel: "high",
        automationLevel: "L3",
        actionSummary: "Multi signer action",
        policySnapshotVersion: "v1.0",
      };

      mockFindUnique.mockResolvedValue(null); // 幂等查重：首次创建不存在，继续创建
      mockCreate.mockResolvedValue(dbRecord);
      const result = await createApprovalCheckpoint(input);

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          requiredSigners: JSON.stringify(["signer1@example.com", "signer2@example.com"]),
          signedList: JSON.stringify([]),
        })
      }));
      expect(result.requiredSigners).toEqual(["signer1@example.com", "signer2@example.com"]);
      expect(result.signedList).toEqual([]);
    });

    it("should throw UnauthorizedSignerError if signer is not in requiredSigners", async () => {
      const dbRecord = {
        checkpointId: "acp-multi-123",
        workspaceId: "ws-1",
        decision: "pending",
        requiredSigners: JSON.stringify(["signer1@example.com", "signer2@example.com"]),
        signedList: JSON.stringify([]),
        inputSnapshot: {},
        expiresAt: new Date(Date.now() + 100000),
        triggerReason: "risk.level.high",
        riskLevel: "high",
        automationLevel: "L3",
        actionSummary: "Multi signer action",
        policySnapshotVersion: "v1.0",
      };

      mockFindUnique.mockResolvedValue(dbRecord);
      const { UnauthorizedSignerError } = await import("../approval");
      await expect(
        decideApprovalCheckpoint("acp-multi-123", "approved", "stranger@example.com")
      ).rejects.toThrow(UnauthorizedSignerError);
    });

    it("should keep status pending but append signer to signedList when not all signers have approved", async () => {
      const dbRecord = {
        checkpointId: "acp-multi-123",
        workspaceId: "ws-1",
        decision: "pending",
        requiredSigners: JSON.stringify(["signer1@example.com", "signer2@example.com"]),
        signedList: JSON.stringify([]),
        inputSnapshot: {},
        expiresAt: new Date(Date.now() + 100000),
        triggerReason: "risk.level.high",
        riskLevel: "high",
        automationLevel: "L3",
        actionSummary: "Multi signer action",
        policySnapshotVersion: "v1.0",
      };

      mockFindUnique.mockResolvedValue(dbRecord);
      mockUpdate.mockResolvedValue({
        ...dbRecord,
        signedList: JSON.stringify(["signer1@example.com"]),
      });

      const result = await decideApprovalCheckpoint("acp-multi-123", "approved", "signer1@example.com");

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { checkpointId: "acp-multi-123" },
        data: {
          signedList: JSON.stringify(["signer1@example.com"]),
        },
      });
      expect(result.decision).toBe("pending");
      expect(result.signedList).toEqual(["signer1@example.com"]);
      expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: "approval.signed",
        actor: "signer1@example.com",
      }));
    });

    it("should set status to approved and trigger integration hook when the last signer approves", async () => {
      const dbRecord = {
        checkpointId: "acp-multi-123",
        workspaceId: "ws-1",
        decision: "pending",
        requiredSigners: JSON.stringify(["signer1@example.com", "signer2@example.com"]),
        signedList: JSON.stringify(["signer1@example.com"]),
        inputSnapshot: {},
        expiresAt: new Date(Date.now() + 100000),
        triggerReason: "risk.level.high",
        riskLevel: "high",
        automationLevel: "L3",
        actionSummary: "Multi signer action",
        policySnapshotVersion: "v1.0",
        proposalId: "proposal-1",
      };

      mockFindUnique.mockResolvedValue(dbRecord);
      mockUpdate.mockResolvedValue({
        ...dbRecord,
        decision: "approved",
        signedList: JSON.stringify(["signer1@example.com", "signer2@example.com"]),
        proposalId: "proposal-1",  // 确保 proposalId 在更新结果中存在，以触发 Snapshot/Canary
      });

      const mockRecordProposalSnapshot = vi.fn();
      const mockTriggerCanary = vi.fn();

      const result = await decideApprovalCheckpoint(
        "acp-multi-123",
        "approved",
        "signer2@example.com",
        undefined,
        {
          writeAuditLog: mockWriteAuditLog,
          recordProposalSnapshot: mockRecordProposalSnapshot,
          triggerCanary: mockTriggerCanary,
        }
      );

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { checkpointId: "acp-multi-123" },
        data: {
          decision: "approved",
          decidedAt: expect.any(Date),
          decidedBy: "signer2@example.com",
          signedList: JSON.stringify(["signer1@example.com", "signer2@example.com"]),
        },
      });
      expect(result.decision).toBe("approved");
      expect(result.signedList).toEqual(["signer1@example.com", "signer2@example.com"]);
      expect(mockRecordProposalSnapshot).toHaveBeenCalledWith("proposal-1");
      expect(mockTriggerCanary).toHaveBeenCalledWith("proposal-1");
      expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: "approval.granted",
        actor: "signer2@example.com",
        detail: expect.stringContaining("多人全票通过"),
      }));
    });

    it("should set status to rejected immediately (one-vote veto) if any signer rejects", async () => {
      const dbRecord = {
        checkpointId: "acp-multi-123",
        workspaceId: "ws-1",
        decision: "pending",
        requiredSigners: JSON.stringify(["signer1@example.com", "signer2@example.com"]),
        signedList: JSON.stringify(["signer1@example.com"]),
        inputSnapshot: {},
        expiresAt: new Date(Date.now() + 100000),
        triggerReason: "risk.level.high",
        riskLevel: "high",
        automationLevel: "L3",
        actionSummary: "Multi signer action",
        policySnapshotVersion: "v1.0",
      };

      mockFindUnique.mockResolvedValue(dbRecord);
      mockUpdate.mockResolvedValue({
        ...dbRecord,
        decision: "rejected",
        decidedBy: "signer2@example.com",
      });

      const result = await decideApprovalCheckpoint("acp-multi-123", "rejected", "signer2@example.com", "Veto reason");

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { checkpointId: "acp-multi-123" },
        data: {
          decision: "rejected",
          decidedAt: expect.any(Date),
          decidedBy: "signer2@example.com",
        },
      });
      expect(result.decision).toBe("rejected");
      expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: "approval.rejected",
        actor: "signer2@example.com",
        detail: expect.stringContaining("拒绝原因: Veto reason"),
      }));
    });
  });


  describe("expireStaleCheckpoints", () => {
    it("should batch expire stale checkpoints and return count", async () => {
      const staleRecords = [
        { checkpointId: "cp-1", actionSummary: "summary1", riskLevel: "high", workspaceId: "ws-1" },
        { checkpointId: "cp-2", actionSummary: "summary2", riskLevel: "low", workspaceId: "ws-1" },
      ];

      mockFindMany.mockResolvedValue(staleRecords);
      mockUpdateMany.mockResolvedValue({ count: 2 });

      const result = await expireStaleCheckpoints("ws-1");

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { checkpointId: { in: ["cp-1", "cp-2"] } },
        data: { decision: "expired" },
      });

      expect(mockWriteAuditLog).toHaveBeenCalledTimes(2);
      expect(result.expired).toBe(2);
    });

    it("should return 0 when no stale checkpoints", async () => {
      mockFindMany.mockResolvedValue([]);
      const result = await expireStaleCheckpoints("ws-1");
      expect(result.expired).toBe(0);
    });
  });

  describe("listPendingCheckpoints", () => {
    it("should return checkpoints with pagination", async () => {
      const records = [
        { checkpointId: "cp-1", workspaceId: "ws-1", decision: "pending", inputSnapshot: {} },
      ];
      mockFindMany.mockResolvedValue(records);
      mockCount.mockResolvedValue(10);

      const result = await listPendingCheckpoints("ws-1", { page: 2, pageSize: 5 });

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { workspaceId: "ws-1", decision: "pending" },
        orderBy: { createdAt: "desc" },
        skip: 5,
        take: 5,
      });

      expect(result.checkpoints.length).toBe(1);
      expect(result.total).toBe(10);
    });
  });

  describe("System Integrations", () => {
    it("should trigger approval checkpoint when guardrail blocks high risk task", async () => {
      const envelope = {
        taskId: "task-001",
        workflowRunId: "wf-001",
        workspaceId: "ws-test",
        actionType: "memory.write",
        input: { data: "test" },
        automationLevel: "L3" as const,
        riskLevel: "high" as const,
        policySnapshotVersion: "v1.0",
        version: "1.0",
        createdAt: new Date(),
        callbackTarget: "http://callback",
        industryId: "ind-1",
        agentId: "agent-1",
        idempotencyKey: "idem-001",
      };

      vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
        id: "ws-test",
        automationLevel: "L2", // 最高只允许 L2，我们的任务是 L3，应当被拦截
      } as unknown as { id: string; name: string; plan: string; automationLevel: string; createdAt: Date });

      mockCreate.mockResolvedValue({
        checkpointId: "acp-1",
        decision: "pending",
        inputSnapshot: {},
      });

      await expect(
        validateTaskAutomationLevel(envelope, "admin")
      ).rejects.toThrow();

      // 验证 createApprovalCheckpoint 被调用了
      expect(mockCreateApprovalCheckpointSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "task-001",
          workspaceId: "ws-test",
          triggerReason: "risk.level.high",
          riskLevel: "high",
          automationLevel: "L3",
          creator: "admin",
        })
      );
    });

    it("should trigger approval checkpoint for high risk proposal generation", async () => {
      const report = {
        workspaceId: "ws-test",
        metrics: { errorRate: 0.4, total: 10, errors: 4, success: 6, errorRateHex: "0.4", successRate: 0.6, windowHours: 24 },
        runId: "wf-test",
        evaluatedAt: new Date(),
        overallScore: 50,
        dimensions: {
          connectorSuccessRate: 0.8,
          workflowCompletionRate: 0.8,
          humanCorrectionRate: 0.1,
          memoryHitRate: 0.8,
          kpiDriftIndex: 0.1,
        },
        anomalies: [],
        proposalEligible: true,
      };

      // Mock HarnessProposal 数据库写入，并让它返回 riskLevel: "high"（从而在 generateProposal 中触发我们的 approval Integration）
      vi.mocked(prisma.harnessProposal.create).mockResolvedValue({
        id: "proposal-test",
        proposalId: "HEP-test",
        workspaceId: "ws-test",
        triggeredBy: "auto",
        triggerReason: "test",
        problemStatement: "test",
        evidence: "[]",
        proposedChange: { riskLevel: "high", description: "High risk proposal test" } as unknown as Prisma.JsonValue,
        requiresHumanApproval: true,
        estimatedImpact: "test",
        affectedAgents: "[]",
        rollbackPlan: "test",
        status: "draft",
        createdAt: new Date(),
        updatedAt: new Date(),
        reviewedBy: null,
        reviewedAt: null,
        targetSkillId: null,
        previousSnapshot: null,
      });

      mockCreate.mockResolvedValue({
        checkpointId: "acp-proposal-1",
        decision: "pending",
        inputSnapshot: {},
      });

      const proposal = await generateProposal(report as unknown as Parameters<typeof generateProposal>[0]);

      expect(proposal.id).toBe("proposal-test");

      // 验证 createApprovalCheckpoint 被调用了
      expect(mockCreateApprovalCheckpointSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: "proposal-test",
          workspaceId: "ws-test",
          triggerReason: "eval.proposal.generated",
          riskLevel: "high",
          automationLevel: "L3",
        })
      );
    });
  });
});
