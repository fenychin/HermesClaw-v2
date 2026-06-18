import { describe, it, expect, vi } from "vitest"
import { parseIntent } from "../orchestration/intent-parser"

function makeDeps(overrides: Record<string, any> = {}) {
  const base = {
    callLlm: vi.fn<[string, string], Promise<string>>(),
    prisma: {
      agent: {
        findUnique: vi.fn(),
      },
    },
  }
  return { ...base, ...overrides } as any
}

describe("parseIntent", () => {
  it("场景 1：普通外贸询盘请求，返回有效 taskName 和 suggestedWorkflowIds", async () => {
    const deps = makeDeps()
    deps.callLlm.mockResolvedValue(
      JSON.stringify({
        taskName: "handle-inquiry",
        goal: "处理客户的五金件询盘，提取产品参数并准备报价",
        suggestedWorkflowIds: ["wf-inquiry-process", "wf-quotation-gen"],
        requiredSkills: ["inquiry-analysis", "cost-accounting"],
      }),
    )
    deps.prisma.agent.findUnique.mockResolvedValue({
      cannotDo: JSON.stringify([]),
    })

    const result = await parseIntent(
      {
        rawText: "请帮我处理这个来自德国的五金件询盘",
        workspaceId: "ws-001",
        userId: "user-001",
        agentId: "agent-001",
      },
      deps,
    )

    expect(result.taskName).toBe("handle-inquiry")
    expect(result.goal).toBe("处理客户的五金件询盘，提取产品参数并准备报价")
    expect(result.suggestedWorkflowIds).toContain("wf-inquiry-process")
    expect(result.requiredSkills).toContain("inquiry-analysis")
    expect(result.cannotDoReasons).toHaveLength(0)
  })

  it("场景 2：cannotDo 规则命中（逗号分隔多关键词）", async () => {
    const deps = makeDeps()
    deps.callLlm.mockResolvedValue(
      JSON.stringify({
        taskName: "unknown",
        goal: "删除客户数据",
        suggestedWorkflowIds: [],
        requiredSkills: [],
      }),
    )
    deps.prisma.agent.findUnique.mockResolvedValue({
      cannotDo: JSON.stringify(["删除客户,订单数据"]),
    })

    const result = await parseIntent(
      {
        rawText: "请删除客户数据并重新录入",
        workspaceId: "ws-001",
        userId: "user-001",
        agentId: "agent-001",
      },
      deps,
    )

    expect(result.cannotDoReasons).toHaveLength(1)
    expect(result.cannotDoReasons[0]).toBe("删除客户,订单数据")
    expect(result.envelopeOverrides).toBeDefined()
  })

  it("场景 3：LLM 返回代码块包裹 JSON，能正确解析", async () => {
    const deps = makeDeps()
    deps.callLlm.mockResolvedValue(
      '```json\n{\n  "taskName": "send-email",\n  "goal": "发送报价邮件给客户",\n  "suggestedWorkflowIds": ["wf-email-send"],\n  "requiredSkills": ["email-compose"]\n}\n```',
    )
    deps.prisma.agent.findUnique.mockResolvedValue({
      cannotDo: JSON.stringify([]),
    })

    const result = await parseIntent(
      {
        rawText: "发送报价邮件给客户",
        workspaceId: "ws-001",
        userId: "user-001",
        agentId: "agent-001",
      },
      deps,
    )

    expect(result.taskName).toBe("send-email")
    expect(result.goal).toBe("发送报价邮件给客户")
    expect(result.suggestedWorkflowIds).toContain("wf-email-send")
  })

  it("场景 4：LLM 返回空字符串，返回 fallback", async () => {
    const deps = makeDeps()
    deps.callLlm.mockResolvedValue("")
    deps.prisma.agent.findUnique.mockResolvedValue({
      cannotDo: JSON.stringify([]),
    })

    const result = await parseIntent(
      {
        rawText: "帮我查一下上周的询盘统计",
        workspaceId: "ws-001",
        userId: "user-001",
        agentId: "agent-001",
      },
      deps,
    )

    expect(result.taskName).toBe("unknown")
    expect(result.goal).toBe("帮我查一下上周的询盘统计")
    expect(result.cannotDoReasons).toHaveLength(0)
    expect(result.suggestedWorkflowIds).toHaveLength(0)
  })

  it("cannotDo 规则不命中时 cannotDoReasons 为空", async () => {
    const deps = makeDeps()
    deps.callLlm.mockResolvedValue(
      JSON.stringify({
        taskName: "handle-inquiry",
        goal: "处理询盘",
        suggestedWorkflowIds: [],
        requiredSkills: [],
      }),
    )
    deps.prisma.agent.findUnique.mockResolvedValue({
      cannotDo: JSON.stringify(["删除客户,订单数据"]),
    })

    const result = await parseIntent(
      {
        rawText: "请帮我处理这个询盘",
        workspaceId: "ws-001",
        userId: "user-001",
        agentId: "agent-001",
      },
      deps,
    )

    expect(result.cannotDoReasons).toHaveLength(0)
    expect(result.taskName).toBe("handle-inquiry")
  })

  it("无 agentId 时不检查 cannotDo，正常返回解析结果", async () => {
    const deps = makeDeps()
    deps.callLlm.mockResolvedValue(
      JSON.stringify({
        taskName: "generate-quotation",
        goal: "生成报价单",
        suggestedWorkflowIds: ["wf-quotation"],
        requiredSkills: ["quotation-gen"],
      }),
    )

    const result = await parseIntent(
      {
        rawText: "生成报价单",
        workspaceId: "ws-001",
        userId: "user-001",
      },
      deps,
    )

    expect(result.taskName).toBe("generate-quotation")
    expect(result.cannotDoReasons).toHaveLength(0)
    expect(deps.prisma.agent.findUnique).not.toHaveBeenCalled()
  })
})
