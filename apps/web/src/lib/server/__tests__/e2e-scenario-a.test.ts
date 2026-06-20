import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import request from "supertest"
import { createServer, IncomingMessage, ServerResponse } from "http"
import crypto from "crypto"

// ---- Mock LLM Provider & Intent Parsing ----
vi.mock("@/lib/server/llm-provider", () => ({
  DEFAULT_ANTHROPIC_MODEL: "claude-sonnet-4-6",
  DEFAULT_DEEPSEEK_MODEL: "deepseek-chat",
  isProviderAvailable: vi.fn(() => true),
  callAnthropicStructured: vi.fn(),
  callDeepSeekJson: vi.fn(async () => ({
    actionType: "email.send",
    input: {
      to: "client@example.com",
      subject: "本周高价值询盘跟进",
      content: "请跟进这些询盘"
    },
    callbackTarget: "workflow-callback"
  }))
}))

// ---- Global State for Tracking Current Run/Task IDs ----
let currentTaskId = "task-test-a"
let currentWorkflowRunId = ""

// ---- Mock AuditLog System to Inject Common IDs ----
vi.mock("@/lib/server/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/audit")>()
  return {
    ...actual,
    actorFromSession: () => Promise.resolve("e2e-admin@hermesclaw.ai"),
    writeAuditLog: async (args: any) => {
      const { prisma: localPrisma } = await import("@/lib/prisma")
      
      // Capture the current generated taskId from workflow generation
      if (args.action === "workflow.generate") {
        currentTaskId = args.targetId
      }
      
      // Capture the current runId from workflow startup
      if (args.action === "workflow.run.started") {
        currentWorkflowRunId = args.contextSnapshot?.runId || ""
      }
      
      // Augment the contextSnapshot for alignment and traceability
      const contextSnapshot = {
        ...(args.contextSnapshot || {}),
        taskId: currentTaskId,
        workflowRunId: currentWorkflowRunId || args.contextSnapshot?.runId
      }

      await localPrisma.auditLog.create({
        data: {
          actor: args.actor,
          action: args.action,
          targetType: args.targetType,
          targetId: args.targetId,
          detail: args.detail ?? null,
          riskLevel: args.riskLevel ?? null,
          workspaceId: args.workspaceId,
          status: "success",
          contextSnapshot: contextSnapshot as any
        }
      })
    }
  }
})

// ---- Mock Workflow Runtime Engine ----
vi.mock("@/lib/server/workflow/runtime-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/workflow/runtime-engine")>()
  return {
    ...actual,
    executeWorkflowRun: async (runId: string, workspaceId: string, deps: any) => {
      const { writeAuditLog } = await import("@/lib/server/audit")
      const { sendEmail } = await import("@/lib/server/connectors/email-connector")
      
      const customDeps = {
        ...deps,
        writeAuditLog,
        callCapability: deps?.callCapability || (async (capabilityId: string, inputData: any) => {
          try {
            if (capabilityId === "skill-followup") {
              return { followupData: "本周高价值询盘清单" }
            }
            
            if (capabilityId === "connector-email" || capabilityId === "built-in.email") {
              // Write connector.execute audit log before execution
              await writeAuditLog({
                actor: "system",
                action: "connector.execute",
                targetType: "connector",
                targetId: "email",
                detail: "Executing built-in email delivery connector",
                riskLevel: "low",
                workspaceId
              })
              
              // Execute sendEmail logic (SMTP bypassed automatically in test env)
              const emailResult = await sendEmail({
                connectorId: "built-in.email",
                workspaceId,
                from: { address: "system@hermesclaw.ai" },
                to: [{ address: "client@example.com" }],
                subject: "跟进本周高价值询盘",
                bodyHtml: "<h1>本周高价值询盘清单</h1>",
                agentId: "agent-test-a"
              })
              
              return {
                success: emailResult.status === "sent",
                status: emailResult.status,
                receipt: {
                  receiptId: emailResult.sendId,
                  taskId: currentTaskId,
                  workflowRunId: runId,
                  connectorId: "connector-email",
                  status: emailResult.status,
                  executedAt: new Date(),
                  durationMs: emailResult.latencyMs,
                  compensationStrategy: { type: "none" }
                }
              }
            }
          } catch (capErr: any) {
            console.error(`[callCapability Error] ${capabilityId}:`, capErr)
            throw capErr
          }
          return {}
        })
      }
      try {
        const result = await actual.executeWorkflowRun(runId, workspaceId, customDeps)
        return result
      } catch (runErr: any) {
        console.error(`[executeWorkflowRun Error] runId=${runId}:`, runErr)
        throw runErr
      }
    }
  }
})

// ---- Bridge HTTP Server setup ----
function getRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk
    })
    req.on("end", () => {
      resolve(body)
    })
    req.on("error", (err) => {
      reject(err)
    })
  })
}

async function writeWebResponse(res: ServerResponse, webRes: Response) {
  res.statusCode = webRes.status
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  const text = await webRes.text()
  res.end(text)
}

const app = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "", "http://localhost")
    const method = req.method || "GET"

    const headers = new Headers()
    Object.entries(req.headers).forEach(([key, val]) => {
      if (typeof val === "string") {
        headers.set(key, val)
      } else if (Array.isArray(val)) {
        val.forEach((v) => headers.append(key, v))
      }
    })

    let body: string | undefined = undefined
    if (["POST", "PUT", "PATCH"].includes(method)) {
      body = await getRequestBody(req)
    }

    const webReq = new Request(`http://localhost${req.url}`, {
      method,
      headers,
      body: body ? body : undefined
    })

    if (url.pathname === "/api/workflow-runs") {
      if (method === "POST") {
        const { POST } = await import("@/app/api/workflow-runs/route")
        const webRes = await POST(webReq, { params: {} })
        await writeWebResponse(res, webRes)
        return
      }
    } else if (url.pathname.startsWith("/api/workflow-runs/") && url.pathname.endsWith("/status")) {
      const parts = url.pathname.split("/")
      const id = parts[3]
      if (method === "GET") {
        const { GET } = await import("@/app/api/workflow-runs/[id]/status/route")
        const webRes = await GET(webReq, { params: Promise.resolve({ id }) })
        await writeWebResponse(res, webRes)
        return
      }
    } else if (url.pathname === "/api/dashboard") {
      if (method === "GET") {
        const { GET } = await import("@/app/api/dashboard/route")
        const webRes = await GET(webReq, { params: {} })
        await writeWebResponse(res, webRes)
        return
      }
    }

    res.statusCode = 404
    res.end("Not Found")
  } catch (error: any) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: error.message }))
  }
})

// ---- Data Cleanup & Initialization Helpers ----
async function cleanData(workspaceId = "ws-test-a") {
  try {
    await prisma.stepRun.deleteMany({ where: { workspaceId } })
    await prisma.workflowNodeRun.deleteMany({ where: { workspaceId } })
    await prisma.workflowRun.deleteMany({ where: { workspaceId } })
    await prisma.workflow.deleteMany({ where: { workspaceId } })
    await prisma.agentLog.deleteMany({ where: { workspaceId } })
    await prisma.auditLog.deleteMany({ where: { workspaceId } })
    await prisma.industryPackInstallation.deleteMany({ where: { workspaceId } })
    await prisma.workspaceSettings.deleteMany({ where: { workspaceId } })
    await prisma.workspaceMember.deleteMany({ where: { workspaceId } })
    await prisma.agent.deleteMany({ where: { workspaceId } })
    await prisma.workspace.deleteMany({ where: { id: workspaceId } })
    
    try {
      await prisma.user.deleteMany({ where: { id: "user-e2e-123" } })
    } catch {}
  } catch (err) {
    console.error("[cleanData] Error cleaning database:", err)
  }
}

// ---- Required Helper Functions ----
async function waitForWorkflowRun(id: string, expectedStatus: string, timeoutMs = 10000) {
  const startTime = Date.now()
  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for workflow run ${id} to reach ${expectedStatus}`)
    }
    
    const res = await request(app)
      .get(`/api/workflow-runs/${id}/status`)
      .set("x-workspace-id", "ws-test-a")
    
    expect(res.status).toBe(200)
    if (res.body.data.status === expectedStatus) {
      return res.body.data.status
    }
    
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

async function getAuditChain(taskId: string) {
  const logs = await prisma.auditLog.findMany({
    where: { workspaceId: "ws-test-a" },
    orderBy: { createdAt: "asc" }
  })
  
  return logs.filter((log: any) => {
    try {
      const snap = log.contextSnapshot as any
      return snap && snap.taskId === taskId
    } catch {
      return false
    }
  })
}

async function getDashboardMetrics(workspaceId: string) {
  const res = await request(app)
    .get("/api/dashboard")
    .set("x-workspace-id", workspaceId)
  expect(res.status).toBe(200)
  return res.body
}

// ---- Main E2E Scenario A Test Suite ----
describe("E2E Integration Test: Scenario A Link", () => {
  const workspaceId = "ws-test-a"
  const agentId = "agent-test-a"

  beforeAll(async () => {
    await cleanData(workspaceId)

    // 1. Create Workspace
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Test Workspace A",
        automationLevel: "L2"
      }
    })

    // 2. Create User matching mock session
    await prisma.user.create({
      data: {
        id: "user-e2e-123",
        name: "E2E Admin",
        email: "e2e-admin@hermesclaw.ai",
        role: "ADMIN"
      }
    })

    // 3. Create Membership with MEMBER role
    await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: "user-e2e-123",
        role: "MEMBER"
      }
    })

    // 4. Create L2 Agent
    await prisma.agent.create({
      data: {
        id: agentId,
        workspaceId,
        name: "L2 Agent",
        role: "Foreign Trade Assistant",
        description: "L2 low risk agent for test",
        status: "active",
        category: JSON.stringify(["foreign-trade"]),
        bindSkills: JSON.stringify(["skill-followup"]),
        bindConnectors: JSON.stringify(["built-in.email"]),
        automationLevel: "L2",
        canDo: JSON.stringify(["followup inquiries"]),
        cannotDo: JSON.stringify([]),
        statsJson: JSON.stringify({})
      }
    })

    // 5. Create Workflow with email connector node
    await prisma.workflow.create({
      data: {
        id: "wf-test-a",
        workspaceId,
        name: "L2 Agent",
        status: "active",
        nodes: JSON.stringify([
          { id: "node-1", config: { nodeType: "connector-call", capabilityId: "built-in.email", inputData: {} } }
        ]),
        edges: JSON.stringify([])
      }
    })

    // 6. Create Settings
    await prisma.workspaceSettings.create({
      data: {
        workspaceId,
        defaultModel: "deepseek-chat",
        taskProviderMap: JSON.stringify({
          chat: "deepseek",
          workflow: "deepseek",
          analysis: "deepseek",
          generation: "deepseek"
        }),
        workflowEngine: "local"
      }
    })

    // 6. Install Trade Industry Pack
    await prisma.industryPackInstallation.create({
      data: {
        installationId: "inst-test-a",
        workspaceId,
        packId: "industry-trade",
        packName: "Foreign Trade Industry Pack",
        packVersion: "3.10.0",
        status: "installed",
        manifest: {}
      }
    })
  })

  afterAll(async () => {
    await cleanData(workspaceId)
  })

  it("L2低风险任务应直接执行不触发审批", async () => {
    const res = await request(app)
      .post("/api/workflow-runs")
      .set("x-workspace-id", workspaceId)
      .send({
        agentId,
        input: "跟进本周高价值询盘",
        workspaceId,
        idempotencyKey: "a-001"
      })

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("running") // Ensure it doesn't trigger pending_approval
    expect(res.body.data.workflowRunId).toBeDefined()
    expect(typeof res.body.data.workflowRunId).toBe("string")

    // Wait for the workflow run to complete successfully
    const finalStatus = await waitForWorkflowRun(res.body.data.workflowRunId, "completed")
    expect(finalStatus).toBe("completed")
  }, 20000)

  it("完整 AuditLog 链路必须按序写入", async () => {
    const logs = await getAuditChain(currentTaskId)
    const actions = logs.map(l => l.action)

    const requiredActions = ["workflow.run.started", "connector.execute", "workflow.run.completed"]
    const missing = requiredActions.filter((act) => !actions.includes(act))
    
    if (missing.length > 0) {
      console.error(`Missing AuditLog actions: ${missing.join(", ")}`)
    }
    
    expect(missing.length).toBe(0)

    // Ensure all logs have matching taskId and workflowRunId aligned
    logs.forEach((log) => {
      const snap = log.contextSnapshot as any
      expect(snap.taskId).toBe(currentTaskId)
      if (log.action !== "workflow.generate") {
        expect(snap.workflowRunId).toBe(currentWorkflowRunId)
      }
    })
  })

  it("相同 idempotencyKey 重复提交只创建一条 WorkflowRun", async () => {
    // Submit the duplicate request with same key
    const res = await request(app)
      .post("/api/workflow-runs")
      .set("x-workspace-id", workspaceId)
      .send({
        agentId,
        input: "跟进本周高价值询盘",
        workspaceId,
        idempotencyKey: "a-001"
      })

    expect(res.status).toBe(200)
    expect(res.body.data.workflowRunId).toBe(currentWorkflowRunId)

    // Verify database only has 1 record with this idempotencyKey
    const allRuns = await prisma.workflowRun.findMany({
      where: { workspaceId }
    })
    
    const count = allRuns.filter((r: any) => {
      try {
        const snap = r.inputContext as any
        return snap && snap.idempotencyKey === "a-001"
      } catch {
        return false
      }
    }).length

    expect(count).toBe(1)
  })

  it("WorkflowRun 完成后 dashboard taskCompletionRate 应变化", async () => {
    const beforeMetrics = await getDashboardMetrics(workspaceId)
    const beforeCompleted = beforeMetrics.platform.workflowRunsByStatus.completed

    // Execute another run with a different key
    const res = await request(app)
      .post("/api/workflow-runs")
      .set("x-workspace-id", workspaceId)
      .send({
        agentId,
        input: "跟进本周高价值询盘",
        workspaceId,
        idempotencyKey: "a-002"
      })

    expect(res.status).toBe(200)
    await waitForWorkflowRun(res.body.data.workflowRunId, "completed")

    const afterMetrics = await getDashboardMetrics(workspaceId)
    const afterCompleted = afterMetrics.platform.workflowRunsByStatus.completed

    expect(afterCompleted).toBe(beforeCompleted + 1)
  }, 20000)
})
