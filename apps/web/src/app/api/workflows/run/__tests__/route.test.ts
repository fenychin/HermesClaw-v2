// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "../route"
import { logger } from "@/lib/logger"
import { hermesClient } from "@/lib/server/adapters/hermes"

// mock auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve({ user: { email: "member@hermesclaw.ai" } })),
}))

// mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// mock workspace context
vi.mock("@/lib/workspace", () => ({
  buildWorkspaceContext: vi.fn(() =>
    Promise.resolve({
      workspaceId: "ws-test-123",
      role: "MEMBER",
      userId: "u-test-123",
    })
  ),
  hasMinRole: vi.fn(() => true),
}))

// mock hermesClient
vi.mock("@/lib/server/adapters/hermes", () => ({
  hermesClient: {
    runWorkflow: vi.fn().mockResolvedValue({
      runId: "run-test-uuid",
      status: "succeeded",
      output: { success: true },
    }),
  },
}))

// mock audit and agent logs
vi.mock("@/lib/server/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue({}),
  actorFromSession: vi.fn().mockResolvedValue("member@hermesclaw.ai"),
}))

vi.mock("@/lib/server/agent-log", () => ({
  writeAgentLog: vi.fn().mockResolvedValue({}),
}))

// 核心 mock：在测试中，我们将特定 action 模拟为 critical 高危动作，以此触发拦截路径测试
vi.mock("@/lib/server/check-automation-gate", async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    isCriticalActionType: (actionType: string, _criticalTypes?: readonly string[]) => {
      return (
        actionType === "trade.send-quotation" ||
        actionType === "trade.sign-contract" ||
        actionType === "skill.send-quote" ||
        actionType === "" || actionType === "test-validation-fail" // 空/无效 _type 也判高危以测试拦截链路
      );
    },
  }
})

describe("POST /api/workflows/run API 路由集成拦截测试", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WORKFLOW_ROUTING_MODE = "hermes"
  })

  it("正常常规任务输入应放行并成功运行", async () => {
    const reqBody = {
      workflowId: "wf-test-1",
      inputs: {
        _type: "trade.handle-inquiry",
        inquiryText: "Valid inquiry text here",
      },
    }
    const req = new Request("http://localhost/api/workflows/run", {
      method: "POST",
      body: JSON.stringify(reqBody),
    })

    const res = await POST(req, {})
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(hermesClient.runWorkflow).toHaveBeenCalled()
  })

  it("当高危动作输入校验失败时应被拦截并返回 400 以及详细错误警告", async () => {
    // 缺少 _type 字段，触发 TypedTaskInputSchema 基础校验
    const reqBody = {
      workflowId: "wf-test-1",
      inputs: {
        // 没有 _type
        data: "incomplete"
      },
    }
    const req = new Request("http://localhost/api/workflows/run", {
      method: "POST",
      body: JSON.stringify(reqBody),
    })

    const res = await POST(req, {})
    const body = await res.json()

    // 预期拦截
    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe("任务输入不符合 actionType 要求")
    expect(hermesClient.runWorkflow).not.toHaveBeenCalled()

    // 确保有日志警告且包含 Zod 的报错明细
    expect(logger.warn).toHaveBeenCalledWith(
      "[WorkflowScheduler] 执行被拦截：任务输入不符合 actionType 要求",
      expect.objectContaining({
        actionType: "",
        errors: expect.arrayContaining([expect.stringContaining("_type")]),
      })
    )
  })

  it("非高危动作在校验失败时应被放行（向后兼容性）", async () => {
    // 未知动作，在测试里它被判定为非高危且经 GenericPayloadSchema 校验通过
    const reqBody = {
      workflowId: "wf-test-1",
      inputs: {
        _type: "trade.some-unknown-action",
        randomField: 42,
      },
    }
    const req = new Request("http://localhost/api/workflows/run", {
      method: "POST",
      body: JSON.stringify(reqBody),
    })

    const res = await POST(req, {})
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(hermesClient.runWorkflow).toHaveBeenCalled()
  })
})
