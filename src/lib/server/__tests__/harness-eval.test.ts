// @vitest-environment node
import { describe, it, expect, vi } from "vitest"

// Mock auth (next-auth 依赖链入口)
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve({ user: { id: "test-user", name: "测试用户" } })),
}));

// Mock writeAuditLog 审计接口以做断言校验
export const mockWriteAuditLog = vi.fn()
vi.mock("@/lib/server/audit", () => ({
  writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args),
  actorFromSession: vi.fn().mockResolvedValue("SYSTEM"),
}))

import { runHarnessEvaluation } from "../harness-eval"
import type { prisma } from "@/lib/prisma"

describe("Harness 评估系统单元测试", () => {
  it("应当在提供了有效的 workspaceId 时正常触发评估并进行隔离查询", async () => {
    // 模拟 prisma DB
    const mockPrisma = {
      agentLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      evolutionLog: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
      },
      harnessProposal: {
        create: vi.fn().mockResolvedValue({
          id: "proposal-1",
          proposalId: "HEP-1234",
          triggeredBy: "auto",
          problemStatement: "检测到零日志",
          targetComponent: "workflow",
          proposedChange: "无变化",
          riskLevel: "low",
          automationLevel: "L2",
          status: "pending",
          estimatedImpact: "无影响",
          createdAt: new Date(),
        }),
      },
    } as unknown as typeof prisma

    const mockSelectModel = vi.fn().mockResolvedValue({
      provider: "deepseek",
      model: "deepseek-chat",
    })

    const mockAnalyzeHarnessLogs = vi.fn().mockResolvedValue({
      draft: {
        problemStatement: "检测到零日志",
        evidence: ["证据 1"],
        targetComponent: "workflow",
        proposedChange: "升级超时阈值",
        riskLevel: "low",
        estimatedImpact: "提高健壮性",
        reportMd: "# 评估报告",
      },
      durationSeconds: 1.5,
    })

    const result = await runHarnessEvaluation(
      "test-workspace-999",
      "auto",
      {
        prisma: mockPrisma,
        selectModel: mockSelectModel,
        analyzeHarnessLogs: mockAnalyzeHarnessLogs,
      }
    )

    // 验证返回值与触发状态
    expect(result.triggered).toBe(true)
    expect(result.metrics.total).toBe(0)

    // 验证底层数据库查询是否带上了 workspaceId 过滤
    expect(mockPrisma.agentLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "test-workspace-999",
        }),
      })
    )

    // 验证写入进化日志和提案时都带上了 workspaceId
    expect(mockPrisma.evolutionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "test-workspace-999",
        }),
      })
    )

    expect(mockPrisma.harnessProposal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "test-workspace-999",
        }),
      })
    )
  })

  it("应当在写入进化日志失败时，记录控制台错误并触发 writeAuditLog 审计", async () => {
    mockWriteAuditLog.mockClear()
    const mockPrisma = {
      agentLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      evolutionLog: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockRejectedValue(new Error("Database connection fail")),
      },
      harnessProposal: {
        create: vi.fn().mockResolvedValue({
          id: "proposal-1",
          proposalId: "HEP-1234",
          triggeredBy: "auto",
          problemStatement: "测试",
          targetComponent: "workflow",
          proposedChange: "测试",
          riskLevel: "low",
          automationLevel: "L2",
          status: "pending",
          estimatedImpact: "测试",
          createdAt: new Date(),
        }),
      },
    } as unknown as typeof prisma

    const mockSelectModel = vi.fn().mockResolvedValue({
      provider: "deepseek",
      model: "deepseek-chat",
    })

    const mockAnalyzeHarnessLogs = vi.fn().mockResolvedValue({
      draft: {
        problemStatement: "测试",
        evidence: ["证据 1"],
        targetComponent: "workflow",
        proposedChange: "测试",
        riskLevel: "low",
        estimatedImpact: "测试",
        reportMd: "# 评估报告",
      },
      durationSeconds: 1.5,
    })

    await runHarnessEvaluation(
      "test-workspace-err-1",
      "auto",
      {
        prisma: mockPrisma,
        selectModel: mockSelectModel,
        analyzeHarnessLogs: mockAnalyzeHarnessLogs,
      }
    )

    // 验证 AuditLog 是否以中等风险记录了这一失败事件
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "evolution.log.fail",
        riskLevel: "medium",
        workspaceId: "test-workspace-err-1",
        detail: expect.stringContaining("Database connection fail"),
      })
    )
  })

  it("类型保护测试：不传 workspaceId 时 TypeScript 编译应当报错", async () => {
    // 提示：若以下两行报错未被 @ts-expect-error 捕获（即没有编译报错），则说明我们没有移除 workspaceId 默认值
    
    // @ts-expect-error 缺少参数：应该有 1 到 3 个参数，但传入了 0 个
    await runHarnessEvaluation()
  })
})
