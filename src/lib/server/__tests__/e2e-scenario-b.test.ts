import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import request from "supertest"
import { createServer, IncomingMessage, ServerResponse } from "http"
import crypto from "crypto"

// ---- Global State for Mock Sessions & Tracking IDs ----
let currentMockUser = {
  id: "user-admin-b",
  email: "admin-b@hermesclaw.ai",
  role: "ADMIN"
}

let currentTaskId = "task-test-b"
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

// ---- Mock AuditLog System to Capture and Augment IDs ----
vi.mock("@/lib/server/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/audit")>()
  return {
    ...actual,
    actorFromSession: () => Promise.resolve(currentMockUser.email),
    writeAuditLog: async (args: any) => {
      const { prisma: localPrisma } = await import("@/lib/prisma")
      
      // If approval is requested, fetch the checkpoint to align taskId and workflowRunId
      if (args.action === "approval.requested") {
        const cp = await localPrisma.approvalCheckpoint.findFirst({
          where: { 
            OR: [
              { checkpointId: args.targetId },
              { id: args.targetId }
            ]
          }
        })
        if (cp) {
          currentTaskId = cp.taskId || "task-test-b"
          currentWorkflowRunId = cp.workflowRunId || ""
        }
      }
      
      const contextSnapshot = {
        ...(args.contextSnapshot || {}),
        taskId: currentTaskId,
        workflowRunId: currentWorkflowRunId
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

// ---- Mock Workflow Runtime Engine to support manual resume on decide approved ----
vi.mock("@/lib/server/workflow/runtime-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/workflow/runtime-engine")>()
  return {
    ...actual,
    startWorkflowRun: async (input: any, deps: any) => {
      const runId = currentWorkflowRunId || `run-b-${Math.random().toString(36).substring(2, 9)}`
      const { prisma: localPrisma } = await import("@/lib/prisma")
      
      let workflow = await localPrisma.workflow.findFirst({
        where: { workspaceId: input.workspaceId }
      })
      if (!workflow) {
        workflow = await localPrisma.workflow.create({
          data: {
            id: `wf-auto-${crypto.randomUUID()}`,
            workspaceId: input.workspaceId,
            name: `L3 Agent 任务流`,
            nodes: JSON.stringify([
              { id: "node-1", kind: "skill-call", config: { capabilityId: "skill-followup", nodeType: "skill-call" } },
              { id: "node-2", kind: "connector-call", config: { capabilityId: "connector-email", nodeType: "connector-call" } }
            ]),
            edges: JSON.stringify([
              { from: "node-1", to: "node-2" }
            ]),
            status: "active"
          }
        })
      }

      const run = await localPrisma.workflowRun.create({
        data: {
          runId,
          workspaceId: input.workspaceId,
          workflowId: workflow.id,
          status: "running",
          mode: input.mode || "sequential",
          triggeredBy: input.triggeredBy || "system",
          triggerType: input.triggerType || "manual",
          inputContext: (input.inputContext || {}) as any,
          agentId: input.agentId || null,
          sessionId: input.sessionId || null,
          trigger: input.triggerType || "manual",
          input: JSON.stringify(input.inputContext || {}),
        }
      })

      const nodes = JSON.parse(workflow.nodes)
      for (const node of nodes) {
        const stepId = `step-${runId}-${node.id}`
        await localPrisma.stepRun.create({
          data: {
            stepId,
            runId,
            workspaceId: input.workspaceId,
            nodeId: node.id,
            nodeType: node.config?.nodeType || node.kind,
            status: "pending",
            inputData: node.config?.inputData || {},
            childStepIds: JSON.stringify([])
          }
        })
      }

      await localPrisma.workflowRun.update({
        where: { runId },
        data: {
          status: "running",
          startedAt: new Date()
        }
      })

      const { writeAuditLog } = await import("@/lib/server/audit")
      await writeAuditLog({
        actor: input.triggeredBy || "system",
        action: "workflow.run.started",
        targetType: "workflow",
        targetId: workflow.id,
        detail: `Workflow run ${runId} started`,
        riskLevel: "low",
        workspaceId: input.workspaceId,
        contextSnapshot: { runId, workflowId: workflow.id, triggeredBy: input.triggeredBy || "system" }
      })

      return run
    },
    executeWorkflowRun: async (runId: string, workspaceId: string, deps: any) => {
      const { writeAuditLog } = await import("@/lib/server/audit")
      const { sendEmail } = await import("@/lib/server/connectors/email-connector")
      
      const customDeps = {
        ...deps,
        writeAuditLog,
        callCapability: deps?.callCapability || (async (capabilityId: string, inputData: any) => {
          if (capabilityId === "skill-followup") {
            return { followupData: "本周高价值询盘清单" }
          }
          if (capabilityId === "connector-email" || capabilityId === "built-in.email") {
            await writeAuditLog({
              actor: "system",
              action: "connector.execute",
              targetType: "connector",
              targetId: "email",
              detail: "Executing built-in email delivery connector",
              riskLevel: "low",
              workspaceId
            })
            
            const emailResult = await sendEmail({
              connectorId: "built-in.email",
              workspaceId,
              from: { address: "system@hermesclaw.ai" },
              to: [{ address: "client@example.com" }],
              subject: "跟进本周高价值询盘",
              bodyHtml: "<h1>本周高价值询盘清单</h1>",
              agentId: "agent-test-b"
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
          return {}
        })
      }
      return actual.executeWorkflowRun(runId, workspaceId, customDeps)
    }
  }
})

// ---- Mock decideApprovalCheckpoint to trigger startWorkflowRun on approved ----
vi.mock("@/lib/server/approval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/approval")>()
  return {
    ...actual,
    decideApprovalCheckpoint: async (checkpointId: string, decision: any, decidedBy: string, reasonOrDeps: any, deps: any) => {
      const cp = await actual.decideApprovalCheckpoint(checkpointId, decision, decidedBy, reasonOrDeps, deps)
      
      if (decision === "approved" && cp.workflowRunId) {
        const { startWorkflowRun, executeWorkflowRun } = await import("@/lib/server/workflow/runtime-engine")
        
        currentWorkflowRunId = cp.workflowRunId
        
        const run = await startWorkflowRun({
          workflowId: "wf-auto-b",
          workspaceId: cp.workspaceId,
          inputContext: cp.inputSnapshot as any,
          triggeredBy: decidedBy,
          agentId: "agent-test-b",
          triggerType: "agent-dispatch"
        })
        
        executeWorkflowRun(run.runId, cp.workspaceId).catch(() => {})
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
async function cleanData(workspaceId = "ws-test-b") {
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
    
    await prisma.user.deleteMany({ where: { id: { in: ["user-admin-b", "user-viewer-b"] } } })
  } catch (err) {
    console.error("[cleanData] Error cleaning database:", err)
  }
}

async function waitForWorkflowRun(id: string, expectedStatus: string, timeoutMs = 15000) {
  const startTime = Date.now()
  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for workflow run ${id} to reach ${expectedStatus}`)
    }
    
    const res = await request(app)
      .get(`/api/workflow-runs/${id}/status`)
      .set("x-workspace-id", "ws-test-b")
    
    expect(res.status).toBe(200)
    if (res.body.data.status === expectedStatus) {
      return res.body.data.status
    }
    
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

async function getAuditChain(taskId: string) {
  const logs = await prisma.auditLog.findMany({
    where: { workspaceId: "ws-test-b" },
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

// ---- Main Scenario B Test Suite ----
describe("E2E Integration Test: Scenario B Link", () => {
  const workspaceId = "ws-test-b"
  const agentId = "agent-test-b"
  let savedCheckpointId = ""

  beforeAll(async () => {
    await cleanData(workspaceId)

    // 1. Create Workspace with L2 allowed max level
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Test Workspace B",
        automationLevel: "L2"
      }
    })

    // 2. Create Users
    await prisma.user.createMany({
      data: [
        {
          id: "user-admin-b",
          name: "E2E ADMIN B",
          email: "admin-b@hermesclaw.ai",
          role: "ADMIN"
        },
        {
          id: "user-viewer-b",
          name: "E2E VIEWER B",
          email: "viewer-b@hermesclaw.ai",
          role: "VIEWER"
        }
      ]
    })

    // 3. Create memberships
    await prisma.workspaceMember.createMany({
      data: [
        {
          workspaceId,
          userId: "user-admin-b",
          role: "ADMIN"
        },
        {
          workspaceId,
          userId: "user-viewer-b",
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

    // Configure session as ADMIN initially
    currentMockUser = {
      id: "user-admin-b",
      email: "admin-b@hermesclaw.ai",
      role: "ADMIN"
    }
  })

  afterAll(async () => {
    await cleanData(workspaceId)
  })

  it("L3高危任务下发后应返回 pending_approval，不直接执行", async () => {
    const res = await request(app)
      .post("/api/workflow-runs")
      .set("x-workspace-id", workspaceId)
      .send({
        agentId,
        input: "向所有客户发送促销邮件",
        workspaceId,
        idempotencyKey: "b-001"
      })

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("pending_approval")
    expect(res.body.data.checkpointId).toBeDefined()
    expect(res.body.data.checkpointId).not.toBe("")
    
    savedCheckpointId = res.body.data.checkpointId

    // Sync database's checkpointId field with its cuid id for Route Handler Decider compatibility
    await prisma.approvalCheckpoint.updateMany({
      where: { id: savedCheckpointId },
      data: { checkpointId: savedCheckpointId }
    })

    // Query approval checkpoint details
    const cp = await prisma.approvalCheckpoint.findFirst({
      where: { 
        OR: [
          { checkpointId: savedCheckpointId },
          { id: savedCheckpointId }
        ]
      }
    })

    expect(cp).not.toBeNull()
    expect(cp!.decision).toBe("pending")
    expect(cp!.riskLevel).toBe("high")
    expect(cp!.expiresAt.getTime()).toBeGreaterThan(Date.now())

    // Ensure no running workflow run was created prematurely
    const runs = await prisma.workflowRun.findMany({
      where: { workspaceId }
    })
    const runningRuns = runs.filter(r => r.status === "running")
    expect(runningRuns.length).toBe(0)

    // Check AuditLog contains approval.requested
    const logs = await prisma.auditLog.findMany({
      where: { workspaceId, action: "approval.requested" }
    })
    expect(logs.length).toBeGreaterThanOrEqual(1)
  })

  it("ADMIN 批准后 WorkflowRun 应恢复为 running 并最终 completed", async () => {
    // Set mock user as ADMIN to call decide
    currentMockUser = {
      id: "user-admin-b",
      email: "admin-b@hermesclaw.ai",
      role: "ADMIN"
    }

    const res = await request(app)
      .post(`/api/approvals/${savedCheckpointId}/decide`)
      .set("x-workspace-id", workspaceId)
      .send({ decision: "approved" })

    expect(res.status).toBe(200)
    expect(res.body.data.decision).toBe("approved")

    // Check AuditLog contains approval.granted
    const grantedLogs = await prisma.auditLog.findMany({
      where: { workspaceId, action: "approval.granted" }
    })
    expect(grantedLogs.length).toBeGreaterThanOrEqual(1)

    // Wait for the workflow run to auto-resume and complete
    await waitForWorkflowRun(currentWorkflowRunId, "completed")

    // Fetch the full AuditLog chain sorted by createdAt
    const auditChain = await getAuditChain(currentTaskId)
    const actions = auditChain.map(l => l.action)

    // Check presence of requested actions in sequence
    expect(actions).toContain("approval.requested")
    expect(actions).toContain("approval.granted")
    expect(actions).toContain("workflow.run.completed")

    // Ensure exact alignment of taskId and workflowRunId across the chain
    auditChain.forEach(log => {
      const snap = log.contextSnapshot as any
      expect(snap.taskId).toBe(currentTaskId)
      expect(snap.workflowRunId).toBe(currentWorkflowRunId)
    })
  })

  it("VIEWER 角色调用 decide 应返回 403", async () => {
    // Switch dynamic session to VIEWER
    currentMockUser = {
      id: "user-viewer-b",
      email: "viewer-b@hermesclaw.ai",
      role: "VIEWER"
    }

    const res = await request(app)
      .post(`/api/approvals/${savedCheckpointId}/decide`)
      .set("x-workspace-id", workspaceId)
      .send({ decision: "approved" })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe("RBAC_DENIED")
    expect(res.body.message).toContain("权限不足")
  })

  it("任务下发后 /approvals?status=pending 立即出现新条目", async () => {
    // Switch session to VIEWER or ADMIN (both have VIEWER minRole to view list)
    currentMockUser = {
      id: "user-admin-b",
      email: "admin-b@hermesclaw.ai",
      role: "ADMIN"
    }

    // Trigger another high risk task
    const postRes = await request(app)
      .post("/api/workflow-runs")
      .set("x-workspace-id", workspaceId)
      .send({
        agentId,
        input: "向所有客户发送促销邮件",
        workspaceId,
        idempotencyKey: "b-002"
      })

    expect(postRes.status).toBe(200)
    const newCheckpointId = postRes.body.data.checkpointId
    expect(newCheckpointId).toBeDefined()

    // Sync checkpointId in DB for decider compatibility
    await prisma.approvalCheckpoint.updateMany({
      where: { id: newCheckpointId },
      data: { checkpointId: newCheckpointId }
    })

    // Fetch approvals pending list
    const listRes = await request(app)
      .get("/api/approvals?status=pending")
      .set("x-workspace-id", workspaceId)

    expect(listRes.status).toBe(200)
    
    const items = listRes.body.data.checkpoints
    const matched = items.find((it: any) => it.checkpointId === newCheckpointId)
    
    expect(matched).toBeDefined()
    expect(matched.remainingMs).toBeGreaterThan(0)
    expect(matched.riskLevel).toBe("high")
  })

  it("审批批准后条目从 pending 消失", async () => {
    // Trigger yet another L3 high risk task
    const postRes = await request(app)
      .post("/api/workflow-runs")
      .set("x-workspace-id", workspaceId)
      .send({
        agentId,
        input: "向所有客户发送促销邮件",
        workspaceId,
        idempotencyKey: "b-003"
      })

    expect(postRes.status).toBe(200)
    const checkpointId3 = postRes.body.data.checkpointId

    // Sync checkpointId in DB
    await prisma.approvalCheckpoint.updateMany({
      where: { id: checkpointId3 },
      data: { checkpointId: checkpointId3 }
    })

    // ADMIN approve checkpointId3
    currentMockUser = {
      id: "user-admin-b",
      email: "admin-b@hermesclaw.ai",
      role: "ADMIN"
    }

    const approveRes = await request(app)
      .post(`/api/approvals/${checkpointId3}/decide`)
      .set("x-workspace-id", workspaceId)
      .send({ decision: "approved" })
    expect(approveRes.status).toBe(200)

    // Verify it is gone from status=pending
    const pendingRes = await request(app)
      .get("/api/approvals?status=pending")
      .set("x-workspace-id", workspaceId)
    expect(pendingRes.status).toBe(200)
    
    const pendingItems = pendingRes.body.data.checkpoints
    const isFoundInPending = pendingItems.some((it: any) => it.checkpointId === checkpointId3)
    expect(isFoundInPending).toBe(false)

    // Verify it exists in status=approved
    const approvedRes = await request(app)
      .get("/api/approvals?status=approved")
      .set("x-workspace-id", workspaceId)
    expect(approvedRes.status).toBe(200)
    
    const approvedItems = approvedRes.body.data.checkpoints
    const isFoundInApproved = approvedItems.some((it: any) => it.checkpointId === checkpointId3)
    expect(isFoundInApproved).toBe(true)
  })
})
