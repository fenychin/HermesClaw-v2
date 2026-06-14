// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"
import { WorkflowSchedulerService } from "../scheduler"
import { hermesClient } from "@/lib/server/adapters/hermes"
import { runWorkflow as runLocalWorkflow } from "@/lib/server/workflow/dag-runner"
import { prisma } from "@/lib/prisma"

// Mock dependencies
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceSettings: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("@/lib/server/adapters/hermes", () => ({
  hermesClient: {
    runWorkflow: vi.fn().mockResolvedValue({
      executionId: "hermes-exec-id",
      status: "running",
      outputs: { result: "hermes-ok" },
    }),
  },
}))

vi.mock("@/lib/server/workflow/dag-runner", () => ({
  runWorkflow: vi.fn().mockResolvedValue({
    runId: "local-run-id",
    status: "completed",
    output: { result: "local-ok" },
  }),
  WorkflowNotFoundError: class extends Error {},
  MaxDepthExceededError: class extends Error {},
}))

vi.mock("@/lib/server/shared/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue({}),
  actorFromSession: vi.fn().mockResolvedValue("member@hermesclaw.ai"),
}))

vi.mock("@/config/runtime-mode", () => ({
  runtimeMode: {
    isDev: true,
    isProd: false,
    isTest: false,
    hermes: { useMock: true },
    openclaw: { useMock: true },
    workflow: { engine: "local" },
    label: "all-mock",
  },
}))

vi.mock("@/lib/server/shared/agent-log", () => ({
  writeAgentLog: vi.fn().mockResolvedValue({}),
}))

describe("WorkflowSchedulerService 统一调度路由测试", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.WORKFLOW_ROUTING_MODE
    // 重置 runtimeMode 内部缓存的 workflow.engine（需要重新 require 或模块级重新计算）
    // 注意：因为 runtimeMode 是模块级常量（at import time），改为 process.env 后需
    // 确保 scheduler 内部不再直读 env，且测试通过 process.env 间接传入。
  })

  it("当 WORKFLOW_ROUTING_MODE 环境变量配置为 hermes 时，直接走远程引擎", async () => {
    process.env.WORKFLOW_ROUTING_MODE = "hermes"

    const result = await WorkflowSchedulerService.runWorkflow({
      workflowId: "wf-1",
      inputs: { foo: "bar" },
      workspaceId: "ws-1",
    })

    expect(hermesClient.runWorkflow).toHaveBeenCalledWith({
      workflowId: "wf-1",
      inputs: { foo: "bar" },
      projectId: undefined,
      agentId: undefined,
    })
    expect(result.runId).toBe("hermes-exec-id")
    expect(result.status).toBe("running")
    expect(runLocalWorkflow).not.toHaveBeenCalled()
  })

  it("当 WORKFLOW_ROUTING_MODE 环境变量配置为 local 时，直接走本地 DAG 执行器", async () => {
    process.env.WORKFLOW_ROUTING_MODE = "local"

    const result = await WorkflowSchedulerService.runWorkflow({
      workflowId: "wf-1",
      inputs: { foo: "bar" },
      workspaceId: "ws-1",
    })

    expect(runLocalWorkflow).toHaveBeenCalledWith("wf-1", { foo: "bar" })
    expect(result.runId).toBe("local-run-id")
    expect(hermesClient.runWorkflow).not.toHaveBeenCalled()
  })

  it("当无全局环境变量，且 WorkspaceSettings 配置为 hermes 时，应使用远程引擎", async () => {
    vi.mocked(prisma.workspaceSettings.findUnique).mockResolvedValue({
      workspaceId: "ws-1",
      workflowEngine: "hermes",
      defaultModel: "deepseek-chat",
      taskProviderMap: "{}",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await WorkflowSchedulerService.runWorkflow({
      workflowId: "wf-1",
      inputs: { foo: "bar" },
      workspaceId: "ws-1",
    })

    expect(prisma.workspaceSettings.findUnique).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1" },
    })
    expect(hermesClient.runWorkflow).toHaveBeenCalled()
    expect(result.runId).toBe("hermes-exec-id")
    expect(runLocalWorkflow).not.toHaveBeenCalled()
  })

  it("当无全局环境变量，且 WorkspaceSettings 配置为 local 时，应使用本地 DAG 执行器", async () => {
    vi.mocked(prisma.workspaceSettings.findUnique).mockResolvedValue({
      workspaceId: "ws-1",
      workflowEngine: "local",
      defaultModel: "deepseek-chat",
      taskProviderMap: "{}",
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await WorkflowSchedulerService.runWorkflow({
      workflowId: "wf-1",
      inputs: { foo: "bar" },
      workspaceId: "ws-1",
    })

    expect(prisma.workspaceSettings.findUnique).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1" },
    })
    expect(runLocalWorkflow).toHaveBeenCalled()
    expect(result.runId).toBe("local-run-id")
    expect(hermesClient.runWorkflow).not.toHaveBeenCalled()
  })

  it("当未作任何配置时，默认 fallback 到本地 DAG 执行器", async () => {
    vi.mocked(prisma.workspaceSettings.findUnique).mockResolvedValue(null)

    const result = await WorkflowSchedulerService.runWorkflow({
      workflowId: "wf-1",
      inputs: { foo: "bar" },
      workspaceId: "ws-1",
    })

    expect(runLocalWorkflow).toHaveBeenCalled()
    expect(result.runId).toBe("local-run-id")
  })
})
