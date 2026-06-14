// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"
import { assertWithinBoundary } from "@/lib/server/hermes/boundary"
import * as llmProvider from "@/lib/server/shared/llm-provider"
import { logger } from "@/lib/logger"

describe("assertWithinBoundary 边界与红线运行时校验", () => {
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
  // 1. 一级拦截：全局高危红线与关键词匹配
  // -------------------------------------------------------------
  it("应该直接拦截包含全局硬红线的动作，无需调用 LLM", async () => {
    // 监听 LLM 相关调用，以确保没有被触发
    const resolveSpy = vi.spyOn(llmProvider, "resolveLlmProvider")
    
    const result = await assertWithinBoundary(
      "agent-123",
      "请帮我 rm -rf /data 整个生产文件夹",
      "default",
      { prisma: mockPrisma }
    )
    
    expect(result.allowed).toBe(false)
    expect(result.violation).toContain("触发高危红线：rm -rf")
    expect(resolveSpy).not.toHaveBeenCalled()
  })

  it("应该直接拦截命中 cannotDo 完整句子或 >= 2个关键词的动作，无需调用 LLM", async () => {
    const resolveSpy = vi.spyOn(llmProvider, "resolveLlmProvider")
    
    // 模拟 Agent 存在且设置了 cannotDo，含有逗号以供 toKeywords 切分出多个关键词
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
    expect(result1.violation).toBe("禁止报价")
    
    // B. 命中 >= 2 个关键词（"签署", "合同" 等）
    const result2 = await assertWithinBoundary(
      "agent-123",
      "帮我签署一份对外合同",
      "default",
      { prisma: mockPrisma }
    )
    expect(result2.allowed).toBe(false)
    expect(result2.violation).toBe("签署、合规、合同")

    expect(resolveSpy).not.toHaveBeenCalled()
  })

  it("当 cannotDo 为空时，第一级过滤通过后应该直接放行，无需调用 LLM", async () => {
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
    expect(resolveSpy).not.toHaveBeenCalled()
  })

  it("当智能体不存在时，应该保守拒绝，直接拦截", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue(null)
    
    const result = await assertWithinBoundary(
      "non-existent",
      "做点普通事情",
      "default",
      { prisma: mockPrisma }
    )
    expect(result.allowed).toBe(false)
    expect(result.violation).toBe("智能体不存在，拒绝执行")
  })

  // -------------------------------------------------------------
  // 2. 二级拦截：LLM 语义拦截与同义分析
  // -------------------------------------------------------------
  it("对于可能绕过关键词匹配但语义上违反 cannotDo 的动作，应该被二级 Anthropic LLM 拦截", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({
      cannotDo: JSON.stringify(["禁止向任何客户报价"]),
    })

    // 动作中不含 "禁止"、"向"、"任何"、"客户"、"报价"，避开了关键词硬过滤
    const action = "给小王算一下这个产品的总费用是 500 美元并通知他"

    // 模拟 Anthropic 决策与返回
    vi.spyOn(llmProvider, "resolveLlmProvider").mockReturnValue({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    })
    
    const anthropicSpy = vi.spyOn(llmProvider, "callAnthropicStructured").mockResolvedValue({
      allowed: false,
      violation: "禁止向任何客户报价",
    })

    const result = await assertWithinBoundary(
      "agent-123",
      action,
      "default",
      { prisma: mockPrisma }
    )
    
    expect(result.allowed).toBe(false)
    expect(result.violation).toBe("禁止向任何客户报价")
    expect(anthropicSpy).toHaveBeenCalled()
  })

  it("对于语义上合法的动作，二级 DeepSeek LLM 应该允许放行", async () => {
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
      violation: null,
    })

    const result = await assertWithinBoundary(
      "agent-123",
      action,
      "default",
      { prisma: mockPrisma }
    )
    
    expect(result.allowed).toBe(true)
    expect(result.violation).toBeUndefined()
    expect(deepseekSpy).toHaveBeenCalled()
  })

  // -------------------------------------------------------------
  // 3. 安全防爆降级
  // -------------------------------------------------------------
  it("若大模型服务抛出异常，应该记录警告日志并安全降级（放行一级匹配通过的动作）", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({
      cannotDo: JSON.stringify(["禁止报价"]),
    })

    // 动作本身 safe（未触发一级硬匹配）
    const action = "发送一封问候邮件给潜在客户"

    // 模拟 LLM 抛错
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
    
    // 降级后应允许执行
    expect(result.allowed).toBe(true)
    expect(result.violation).toBeUndefined()
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("二级 LLM 语义判定失败"),
      expect.any(Object)
    )
  })
})
