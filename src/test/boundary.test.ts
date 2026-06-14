// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"
import { assertWithinBoundary } from "@/lib/server/hermes/boundary"
import * as llmProvider from "@/lib/server/shared/llm-provider"
import { logger } from "@/lib/logger"

// Mock audit to avoid next-auth/next/server import chain in node test env
vi.mock("@/lib/server/shared/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue({}),
  actorFromSession: vi.fn().mockResolvedValue("test-user@hermesclaw.ai"),
}))

describe("assertWithinBoundary 边界与红线运行时校验（四级决策 + BoundaryDecision 契约）", () => {
  let mockPrisma: any

  beforeEach(() => {
    vi.restoreAllMocks()
    mockPrisma = {
      agent: {
        findUnique: vi.fn(),
      },
    }
  })

  // -------------------------------------------------------------
  // 1. 一级拦截：全局高危红线（source: hard-redline）
  // -------------------------------------------------------------
  it("应该直接拦截包含全局硬红线的动作（source: hard-redline），无需调用 LLM", async () => {
    const resolveSpy = vi.spyOn(llmProvider, "resolveLlmProvider")

    const result = await assertWithinBoundary(
      "agent-123",
      "请帮我 rm -rf /data 整个生产文件夹",
      "default",
      { prisma: mockPrisma }
    )

    expect(result.allowed).toBe(false)
    expect(result.source).toBe("hard-redline")
    expect(result.reason).toContain("rm -rf")
    expect(resolveSpy).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------
  // 2. 关键词匹配（source: keyword，短路加速器）
  // -------------------------------------------------------------
  it("应该直接拦截命中 cannotDo 完整句子或 ≥2 个关键词的动作（source: keyword），无需调用 LLM", async () => {
    const resolveSpy = vi.spyOn(llmProvider, "resolveLlmProvider")

    mockPrisma.agent.findUnique.mockResolvedValue({
      cannotDo: JSON.stringify(["禁止报价", "签署、合规、合同"]),
    })

    // A. 完整匹配 cannotDo 原文
    const result1 = await assertWithinBoundary(
      "agent-123",
      "为该客户提供一份禁止报价",
      "default",
      { prisma: mockPrisma }
    )
    expect(result1.allowed).toBe(false)
    expect(result1.source).toBe("keyword")
    expect(result1.reason).toContain("禁止报价")

    // B. 命中 ≥ 2 个关键词
    const result2 = await assertWithinBoundary(
      "agent-123",
      "帮我签署一份对外合同",
      "default",
      { prisma: mockPrisma }
    )
    expect(result2.allowed).toBe(false)
    expect(result2.source).toBe("keyword")

    expect(resolveSpy).not.toHaveBeenCalled()
  })

  it("当 cannotDo 为空时，keyword 级通过后应该直接放行，无需调用 LLM", async () => {
    const resolveSpy = vi.spyOn(llmProvider, "resolveLlmProvider")

    mockPrisma.agent.findUnique.mockResolvedValue({
      cannotDo: JSON.stringify([]),
    })

    const result = await assertWithinBoundary(
      "agent-123",
      "帮客户查询订单物流状态",
      "default",
      { prisma: mockPrisma }
    )
    expect(result.allowed).toBe(true)
    expect(result.source).toBe("keyword")
    expect(resolveSpy).not.toHaveBeenCalled()
  })

  it("当智能体不存在时，应该保守拒绝（source: hard-redline）", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue(null)

    const result = await assertWithinBoundary(
      "non-existent",
      "做点普通事情",
      "default",
      { prisma: mockPrisma }
    )
    expect(result.allowed).toBe(false)
    expect(result.source).toBe("hard-redline")
    expect(result.reason).toContain("智能体不存在")
  })

  // -------------------------------------------------------------
  // 3. LLM 语义判定（source: llm，主路径）
  // -------------------------------------------------------------
  it("对于语义上违反 cannotDo 的动作，LLM 应拦截（source: llm）", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({
      cannotDo: JSON.stringify(["禁止向任何客户报价"]),
    })

    const action = "给小王算一下这个产品的总费用是 500 美元并通知他"

    vi.spyOn(llmProvider, "resolveLlmProvider").mockReturnValue({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    })

    const anthropicSpy = vi.spyOn(llmProvider, "callAnthropicStructured").mockResolvedValue({
      allowed: false,
      reason: "语义上等同于向客户报价，违反「禁止向任何客户报价」",
    })

    const result = await assertWithinBoundary(
      "agent-123",
      action,
      "default",
      { prisma: mockPrisma }
    )

    expect(result.allowed).toBe(false)
    expect(result.source).toBe("llm")
    expect(result.reason).toContain("禁止向任何客户报价")
    expect(anthropicSpy).toHaveBeenCalled()
  })

  it("对于语义上合法的动作，LLM 应该放行（source: llm）", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({
      cannotDo: JSON.stringify(["禁止向任何客户报价"]),
    })

    const action = "回复小王说我们收到他的反馈了，正在核实详情"

    vi.spyOn(llmProvider, "resolveLlmProvider").mockReturnValue({
      provider: "deepseek",
      model: "deepseek-chat",
    })

    const deepseekSpy = vi.spyOn(llmProvider, "callDeepSeekJson").mockResolvedValue({
      allowed: true,
      reason: "此动作为客服回复，不涉及报价行为",
    })

    const result = await assertWithinBoundary(
      "agent-123",
      action,
      "default",
      { prisma: mockPrisma }
    )

    expect(result.allowed).toBe(true)
    expect(result.source).toBe("llm")
    expect(result.llmProvider).toBe("deepseek")
    expect(deepseekSpy).toHaveBeenCalled()
  })

  // -------------------------------------------------------------
  // 4. LLM 失败 → fail-closed（安全优先，不再 fail-open）
  // -------------------------------------------------------------
  it("若 LLM 调用抛出异常，应该 fail-closed 拒绝执行（source: llm-fail-closed）", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({
      cannotDo: JSON.stringify(["禁止报价"]),
    })

    const action = "发送一封问候邮件给潜在客户"

    vi.spyOn(llmProvider, "resolveLlmProvider").mockImplementation(() => {
      throw new Error("API Key Missing")
    })

    const loggerWarnSpy = vi.spyOn(logger, "warn")

    const result = await assertWithinBoundary(
      "agent-123",
      action,
      "default",
      { prisma: mockPrisma }
    )

    // fail-closed：LLM 失败 → 拒绝执行（安全优先）
    expect(result.allowed).toBe(false)
    expect(result.source).toBe("llm-fail-closed")
    expect(result.reason).toContain("API Key Missing")
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("fail-closed"),
      expect.any(Object)
    )
  })

  // -------------------------------------------------------------
  // 5. 契约版本验证
  // -------------------------------------------------------------
  it("所有 BoundaryDecision 应包含有效的 version 字段", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({
      cannotDo: JSON.stringify([]),
    })

    const result = await assertWithinBoundary(
      "agent-123",
      "正常的客户查询",
      "default",
      { prisma: mockPrisma }
    )

    expect(result.allowed).toBe(true)
    expect(result.version).toBeDefined()
    expect(typeof result.version).toBe("string")
    expect(result.version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
