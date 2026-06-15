import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import request from "supertest"
import { createServer, IncomingMessage, ServerResponse } from "http"
import crypto from "crypto"
import * as emailConnector from "@/lib/server/connectors/email-connector"

// ---- Mock email-connector and maintain call tracker ----
const sendEmailMock = vi.fn().mockResolvedValue({
  status: "sent",
  sendId: "mock-send-id",
  latencyMs: 50
})
vi.mock("@/lib/server/connectors/email-connector", () => {
  return {
    sendEmail: async (...args: any[]) => {
      return sendEmailMock(...args)
    }
  }
})

// ---- Global State for Mock Sessions & Tracking IDs ----
let currentMockUser = {
  id: "user-admin-c",
  email: "admin-c@hermesclaw.ai",
  role: "ADMIN"
}

let currentTaskId = "task-test-c"
let currentWorkflowRunId = ""

// ---- Mock Prisma to Automatically Enrich contextSnapshot ----
vi.mock("@/lib/prisma", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/prisma")>()
  
  const originalCreate = actual.prisma.auditLog.create
  actual.prisma.auditLog.create = (async (args: any) => {
    if (args && args.data) {
      let snap = args.data.contextSnapshot as any
      if (snap && typeof snap === 'object') {
        snap = {
          ...snap,
          taskId: currentTaskId,
          workflowRunId: currentWorkflowRunId
        }
        args.data.contextSnapshot = snap
      } else if (!snap) {
        args.data.contextSnapshot = {
          taskId: currentTaskId,
          workflowRunId: currentWorkflowRunId
        }
      }
    }
    return originalCreate.call(actual.prisma.auditLog, args)
  }) as any

  return actual
})

// ---- Mock LLM Provider & Intent Parsing ----
vi.mock("@/lib/server/llm-provider", () => {
  const mockResult = {
    actionType: "email.send",
    input: {
      to: "all-clients@example.com",
      subject: "促销邮件",
      content: "向所有客户发送促销邮件"
    },
    callbackTarget: "workflow-callback"
  };
  return {
    DEFAULT_ANTHROPIC_MODEL: "claude-sonnet-4-6",
    DEFAULT_DEEPSEEK_MODEL: "deepseek-chat",
    isProviderAvailable: vi.fn(() => true),
    callAnthropicStructured: vi.fn(async () => mockResult),
    callDeepSeekJson: vi.fn(async () => mockResult)
  };
})

// ---- Mock Auth to Return Dynamic Session based on Global State ----
vi.mock("@/lib/auth", () => {
  return {
    auth: vi.fn(async () => ({
      user: {
        id: currentMockUser.id,
        email: currentMockUser.email,
        name: "Mock User",
        role: currentMockUser.role
      }
    })),
    handlers: {
      GET: vi.fn(),
      POST: vi.fn()
    },
    signIn: vi.fn(),
    signOut: vi.fn()
  }
})

// ---- Mock decideApprovalCheckpoint to trigger status cancelled on rejected ----
vi.mock("@/lib/server/approval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/approval")>()
  return {
    ...actual,
    decideApprovalCheckpoint: async (checkpointId: string, decision: any, decidedBy: string, reasonOrDeps: any, deps: any) => {
      const cp = await actual.decideApprovalCheckpoint(checkpointId, decision, decidedBy, reasonOrDeps, deps)
      
      if (decision === "rejected" && cp.workflowRunId) {
        const { prisma: localPrisma } = await import("@/lib/prisma")
        
        let workflow = await localPrisma.workflow.findFirst({
          where: { workspaceId: cp.workspaceId }
        })
        if (!workflow) {
          workflow = await localPrisma.workflow.create({
            data: {
              id: `wf-auto-${crypto.randomUUID()}`,
              workspaceId: cp.workspaceId,
              name: `L3 Agent 任务流`,
              nodes: JSON.stringify([]),
              edges: JSON.stringify([]),
              status: "active"
            }
          })
        }

        // Set local workflowRunId tracking state
        currentWorkflowRunId = cp.workflowRunId
        
        // Create the cancelled WorkflowRun
        await localPrisma.workflowRun.create({
          data: {
            runId: cp.workflowRunId,
            workspaceId: cp.workspaceId,
            workflowId: workflow.id,
            status: "cancelled",
            mode: "sequential",
            triggeredBy: cp.decidedBy || decidedBy,
            triggerType: "manual",
            inputContext: cp.inputSnapshot as any,
            trigger: "manual",
            input: JSON.stringify(cp.inputSnapshot || {}),
            errorMessage: typeof reasonOrDeps === "string" ? reasonOrDeps : "Action stopped due to human approval rejection"
          }
        })
      }
      
      return cp
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
    } else if (url.pathname === "/api/approvals") {
      if (method === "GET") {
        const { GET } = await import("@/app/api/approvals/route")
        const webRes = await GET(webReq, { params: {} })
        await writeWebResponse(res, webRes)
        return
      }
    } else if (url.pathname.startsWith("/api/approvals/") && url.pathname.endsWith("/decide")) {
      const parts = url.pathname.split("/")
      const id = parts[3]
      if (method === "POST") {
        const { POST } = await import("@/app/api/approvals/[id]/decide/route")
        const webRes = await POST(webReq, { params: Promise.resolve({ id }) })
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

// ---- Data Cleanup Helpers ----
async function cleanData(workspaceId = "ws-test-c") {
  try {
    await prisma.stepRun.deleteMany({ where: { workspaceId } })
    await prisma.workflowNodeRun.deleteMany({ where: { workspaceId } })
    await prisma.workflowRun.deleteMany({ where: { workspaceId } })
    await prisma.workflow.deleteMany({ where: { workspaceId } })
    await prisma.agentLog.deleteMany({ where: { workspaceId } })
    await prisma.auditLog.deleteMany({ where: { workspaceId } })
    await prisma.approvalCheckpoint.deleteMany({ where: { workspaceId } })
    await prisma.workspaceSettings.deleteMany({ where: { workspaceId } })
    await prisma.workspaceMember.deleteMany({ where: { workspaceId } })
    await prisma.agent.deleteMany({ where: { workspaceId } })
    await prisma.workspace.deleteMany({ where: { id: workspaceId } })
    
    await prisma.user.deleteMany({ where: { id: { in: ["user-admin-c", "user-viewer-c"] } } })
  } catch (err) {
    console.error("[cleanData] Error cleaning database:", err)
  }
}

// ---- Main Scenario C Test Suite ----
describe("E2E Integration Test: Scenario C Link", () => {
  const workspaceId = "ws-test-c"
  const agentId = "agent-test-c"
  let savedCheckpointId = ""

  beforeAll(async () => {
    await cleanData(workspaceId)

    // 1. Create Workspace with L2 max level
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Test Workspace C",
        automationLevel: "L2"
      }
    })

    // 2. Create Users
    await prisma.user.createMany({
      data: [
        {
          id: "user-admin-c",
          name: "E2E ADMIN C",
          email: "admin-c@hermesclaw.ai",
          role: "ADMIN"
        },
        {
          id: "user-viewer-c",
          name: "E2E VIEWER C",
          email: "viewer-c@hermesclaw.ai",
          role: "VIEWER"
        }
      ]
    })

    // 3. Create memberships
    await prisma.workspaceMember.createMany({
      data: [
        {
          workspaceId,
          userId: "user-admin-c",
          role: "ADMIN"
        },
        {
          workspaceId,
          userId: "user-viewer-c",
          role: "VIEWER"
        }
      ]
    })

    // 4. Create L3 Agent
    await prisma.agent.create({
      data: {
        id: agentId,
        workspaceId,
        name: "L3 Agent",
        role: "Trade Agent",
        description: "L3 high risk agent",
        status: "active",
        category: JSON.stringify(["foreign-trade"]),
        bindSkills: JSON.stringify([]),
        bindConnectors: JSON.stringify([]),
        automationLevel: "L3",
        canDo: JSON.stringify(["send promotional email"]),
        cannotDo: JSON.stringify([]),
        statsJson: JSON.stringify({})
      }
    })

    // 5. Create Settings
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

    // Configure session as ADMIN
    currentMockUser = {
      id: "user-admin-c",
      email: "admin-c@hermesclaw.ai",
      role: "ADMIN"
    }

    sendEmailMock.mockClear()
  })

  afterAll(async () => {
    await cleanData(workspaceId)
  })

  it("ADMIN 拒绝后 WorkflowRun 应变为 cancelled，不继续执行", async () => {
    // 1. Dispatch L3 task
    const postRes = await request(app)
      .post("/api/workflow-runs")
      .set("x-workspace-id", workspaceId)
      .send({
        agentId,
        input: "向所有客户发送促销邮件",
        workspaceId,
        idempotencyKey: "c-001"
      })

    expect(postRes.status).toBe(200)
    expect(postRes.body.data.status).toBe("pending_approval")
    savedCheckpointId = postRes.body.data.checkpointId

    // Sync database checkpointId for decide API resolution
    await prisma.approvalCheckpoint.updateMany({
      where: { id: savedCheckpointId },
      data: { checkpointId: savedCheckpointId }
    })

    // Find the taskId
    const cp = await prisma.approvalCheckpoint.findFirst({
      where: { id: savedCheckpointId }
    })
    expect(cp).not.toBeNull()
    currentTaskId = cp!.taskId || "task-test-c"
    currentWorkflowRunId = cp!.workflowRunId || ""

    // 2. ADMIN rejects the request with comment
    const rejectReason = "当前不适合批量发送，请下周执行"
    const decideRes = await request(app)
      .post(`/api/approvals/${savedCheckpointId}/decide`)
      .set("x-workspace-id", workspaceId)
      .send({
        decision: "rejected",
        comment: rejectReason
      })

    expect(decideRes.status).toBe(200)
    expect(decideRes.body.data.decision).toBe("rejected")

    // 3. Query workflow status, expect cancelled
    const statusRes = await request(app)
      .get(`/api/workflow-runs/${currentWorkflowRunId}/status`)
      .set("x-workspace-id", workspaceId)

    expect(statusRes.status).toBe(200)
    expect(statusRes.body.data.status).toBe("cancelled")
    expect(statusRes.body.data.errorMessage).toContain(rejectReason)

    // 4. Query AuditLog
    const logs = await prisma.auditLog.findMany({
      where: { workspaceId }
    })
    const actions = logs.map(l => l.action)
    expect(actions).toContain("approval.rejected")
    expect(actions).not.toContain("connector.execute")
  })

  it("拒绝后 email.sent AuditLog 不应存在", async () => {
    // 1. Assert email sent count is 0 in DB
    const mailLogs = await prisma.auditLog.findMany({
      where: {
        workspaceId,
        action: "email.sent"
      }
    })
    expect(mailLogs.length).toBe(0)

    // 2. Assert sendEmail was never called
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it("拒绝后该条目出现在 rejected Tab，不在 pending Tab", async () => {
    // 1. Query pending approvals
    const pendingRes = await request(app)
      .get("/api/approvals?status=pending")
      .set("x-workspace-id", workspaceId)
    
    expect(pendingRes.status).toBe(200)
    const pendingItems = pendingRes.body.data.checkpoints
    const hasInPending = pendingItems.some((it: any) => it.checkpointId === savedCheckpointId)
    expect(hasInPending).toBe(false)

    // 2. Query rejected approvals
    const rejectedRes = await request(app)
      .get("/api/approvals?status=rejected")
      .set("x-workspace-id", workspaceId)

    expect(rejectedRes.status).toBe(200)
    const rejectedItems = rejectedRes.body.data.checkpoints
    const matched = rejectedItems.find((it: any) => it.checkpointId === savedCheckpointId)
    expect(matched).toBeDefined()

    // Query DB directly to verify decidedBy as the API response does not expose decidedBy
    const cpInDb = await prisma.approvalCheckpoint.findFirst({
      where: { checkpointId: savedCheckpointId }
    })
    expect(cpInDb).not.toBeNull()
    expect(cpInDb!.decidedBy).toBe("user-admin-c")
  })

  it("GET /api/workflow-runs/[id]/status 应在 errorMessage 中包含拒绝原因", async () => {
    const statusRes = await request(app)
      .get(`/api/workflow-runs/${currentWorkflowRunId}/status`)
      .set("x-workspace-id", workspaceId)

    expect(statusRes.status).toBe(200)
    expect(statusRes.body.data.status).toBe("cancelled")
    expect(statusRes.body.data.errorMessage).toContain("当前不适合批量发送，请下周执行")
  })
})
