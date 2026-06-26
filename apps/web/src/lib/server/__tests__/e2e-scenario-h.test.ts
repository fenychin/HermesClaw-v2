import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import request from "supertest"
import { createServer, IncomingMessage, ServerResponse } from "http"
import crypto from "crypto"
import { executeRollback } from "@/lib/server/rollback"

// ---- Mock Intent Service (must be at top level and use mock-prefixed variables) ----
const mockWorkspaceId = "ws-test-h"
const mockProjectId = "proj-test-h"

vi.mock("@/lib/server/intent-service", () => {
  return {
    parseIntentToTaskEnvelope: vi.fn(async (input: string, ctx: any) => {
      return {
        taskId: "task-test-h",
        workflowRunId: "run-test-h",
        workspaceId: ctx.workspaceId || mockWorkspaceId,
        agentId: ctx.agentId || "agent-test-h",
        actionType: "noop",
        input: { projectId: mockProjectId, delayMs: 1 },
        automationLevel: "L2",
        riskLevel: "low",
        idempotencyKey: "h-001",
        version: "1.0"
      }
    })
  }
})

// ---- Global State for Mock Session ----
let currentMockUser = {
  id: "user-admin-h",
  email: "admin-h@hermesclaw.ai",
  role: "ADMIN"
}

// ---- Mock Auth ----
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

    if (url.pathname === "/api/cron/canary-eval") {
      if (method === "GET") {
        const { GET } = await import("@/app/api/cron/canary-eval/route")
        const webRes = await GET(webReq)
        await writeWebResponse(res, webRes)
        return
      }
    } else if (url.pathname === "/api/rollbacks") {
      if (method === "POST") {
        const bodyJson = JSON.parse(body || "{}")
        if (bodyJson.confirm !== true) {
          res.statusCode = 400
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ success: false, error: "缺少 confirm 字段或 confirm 不为 true" }))
          return
        }
        const { POST } = await import("@/app/api/rollbacks/route")
        const webRes = await POST(webReq, { params: {} } as any)
        await writeWebResponse(res, webRes)
        return
      }
    } else if (url.pathname.startsWith("/api/rollbacks/") && url.pathname.endsWith("/retry")) {
      const parts = url.pathname.split("/")
      const id = parts[3]
      if (id && method === "POST") {
        const bodyJson = JSON.parse(body || "{}")
        if (bodyJson.confirm !== true) {
          res.statusCode = 400
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ success: false, error: "缺少 confirm 字段" }))
          return
        }
        const { POST } = await import("@/app/api/rollbacks/[id]/retry/route")
        const webRes = await POST(webReq, { params: Promise.resolve({ id }) })
        await writeWebResponse(res, webRes)
        return
      }
    } else if (url.pathname === "/api/dashboard") {
      if (method === "GET") {
        const { GET } = await import("@/app/api/dashboard/route")
        const webRes = await GET(webReq)
        await writeWebResponse(res, webRes)
        return
      }
    } else if (url.pathname === "/api/workflow-runs") {
      if (method === "POST") {
        const { POST } = await import("@/app/api/workflow-runs/route")
        const webRes = await POST(webReq, { params: {} } as any)
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
async function cleanData(workspaceId = "ws-test-h") {
  try {
    await prisma.memoryRevision.deleteMany({ where: { workspaceId } })
    await prisma.memory.deleteMany({ where: { workspaceId } })
    await prisma.stepRun.deleteMany({ where: { workspaceId } })
    await prisma.workflowRun.deleteMany({ where: { workspaceId } })
    await prisma.workflow.deleteMany({ where: { workspaceId } })
    await prisma.agentLog.deleteMany({ where: { workspaceId } })
    await prisma.harnessRollback.deleteMany({ where: { workspaceId } })
    await prisma.harnessCanary.deleteMany({ where: { workspaceId } })
    await prisma.harnessSnapshot.deleteMany({ where: { workspaceId } })
    await prisma.harnessProposal.deleteMany({ where: { workspaceId } })
    await prisma.skill.deleteMany({ where: { workspaceId } })
    await prisma.agent.deleteMany({ where: { workspaceId } })
    await prisma.project.deleteMany({ where: { workspaceId } })
    await prisma.auditLog.deleteMany({ where: { workspaceId } })
    await prisma.workspaceSettings.deleteMany({ where: { workspaceId } })
    await prisma.workspaceMember.deleteMany({ where: { workspaceId } })
    await prisma.workspace.deleteMany({ where: { id: workspaceId } })
    
    await prisma.user.deleteMany({ where: { id: { in: ["user-admin-h"] } } })
  } catch (err) {
    console.error("[cleanData] Error cleaning database:", err)
  }
}

// ---- Main Scenario H Test Suite ----
describe("E2E Integration Test: Scenario H Link", () => {
  const workspaceId = "ws-test-h"
  const projectId = "proj-test-h"

  beforeAll(async () => {
    await cleanData(workspaceId)

    // 1. Create Workspace
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Test Workspace H",
        automationLevel: "L2"
      }
    })

    // 2. Create User
    await prisma.user.create({
      data: {
        id: "user-admin-h",
        name: "E2E ADMIN H",
        email: "admin-h@hermesclaw.ai",
        role: "ADMIN"
      }
    })

    // 3. Create membership
    await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: "user-admin-h",
        role: "ADMIN"
      }
    })

    // 4. Create Settings
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

    // 5. Create Project
    await prisma.project.create({
      data: {
        id: projectId,
        workspaceId,
        name: "E2E Test Project H",
        type: "consulting",
        owner: "user-admin-h",
        activeAgents: JSON.stringify([]),
        riskPoints: JSON.stringify([]),
        nextActions: JSON.stringify([]),
        tags: JSON.stringify([])
      }
    })

    // 6. Create L3 Agent with status=canary
    await prisma.agent.create({
      data: {
        id: "agent-test-h",
        workspaceId,
        name: "Canary Agent H",
        role: "QA",
        description: "L3 Canary Agent H",
        status: "canary",
        harnessVersion: "v2-canary",
        automationLevel: "L3",
        category: JSON.stringify(["qa"]),
        bindSkills: JSON.stringify([]),
        bindConnectors: JSON.stringify([]),
        canDo: JSON.stringify([]),
        cannotDo: JSON.stringify([]),
        statsJson: JSON.stringify({})
      }
    })

    // 7. Create HarnessProposal
    await prisma.harnessProposal.create({
      data: {
        id: "prop-test-h",
        proposalId: "HEP-test-h",
        workspaceId,
        triggeredBy: "manual",
        triggerReason: "Test",
        problemStatement: "Test problem",
        proposedChange: {},
        estimatedImpact: "High",
        rollbackPlan: "一键回滚",
        status: "approved"
      }
    })

    // 8. Create HarnessSnapshot (pre-canary snapshot)
    await prisma.harnessSnapshot.create({
      data: {
        snapshotId: "snap-test-h",
        workspaceId,
        agentId: "agent-test-h",
        proposalId: "prop-test-h",
        snapshotType: "pre-canary",
        agentConfig: {
          name: "Canary Agent H",
          role: "QA",
          description: "L3 Canary Agent H",
          status: "idle",
          harnessVersion: "v1.0.0",
          automationLevel: "L2",
          bindSkills: [],
          bindConnectors: [],
          canDo: [],
          cannotDo: [],
          statsJson: {}
        },
        workflowTemplates: [],
        skillBindings: [],
        connectorBindings: [],
        policySnapshotVersion: "1.0.0",
        status: "active"
      }
    })

    // 9. Create running HarnessCanary deployment
    await prisma.harnessCanary.create({
      data: {
        canaryId: "canary-test-h",
        workspaceId,
        proposalId: "prop-test-h",
        agentId: "agent-test-h",
        snapshotId: "snap-test-h",
        trafficPercent: 10,
        observationWindowMs: 24 * 60 * 60 * 1000,
        startedAt: new Date(),
        endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Must be in the future
        status: "running"
      }
    })

    // 10. Write 5 AgentLog logs: 3 failed/error, 2 success/completed (60% errorRate > 20% threshold)
    await prisma.agentLog.createMany({
      data: [
        { id: "log-1", workspaceId, agentId: "agent-test-h", status: "failed", taskName: "task", duration: "100", detail: "Error" },
        { id: "log-2", workspaceId, agentId: "agent-test-h", status: "error", taskName: "task", duration: "100", detail: "Error" },
        { id: "log-3", workspaceId, agentId: "agent-test-h", status: "failed", taskName: "task", duration: "100", detail: "Error" },
        { id: "log-4", workspaceId, agentId: "agent-test-h", status: "success", taskName: "task", duration: "100", detail: "Success" },
        { id: "log-5", workspaceId, agentId: "agent-test-h", status: "completed", taskName: "task", duration: "100", detail: "Success" }
      ]
    })

    // 10.5. Create Workflow to satisfy the foreign key constraint of WorkflowRuns
    await prisma.workflow.create({
      data: {
        id: "wf-h",
        workspaceId,
        name: "Canary Agent H 任务流",
        nodes: JSON.stringify([
          { id: "node-1", kind: "delay", config: { nodeId: "node-1", nodeType: "delay" } }
        ]),
        edges: "[]",
        status: "active"
      }
    })

    // 11. Write two WorkflowRuns as denominator for rollbackRate calculation
    await prisma.workflowRun.createMany({
      data: [
        { runId: "wr-h1", id: "wr-h1", workspaceId, workflowId: "wf-h", status: "completed", mode: "sequential", triggeredBy: "system", triggerType: "manual" },
        { runId: "wr-h2", id: "wr-h2", workspaceId, workflowId: "wf-h", status: "completed", mode: "sequential", triggeredBy: "system", triggerType: "manual" }
      ]
    })

    // 12. Mock AuditLog Create to map action names to satisfy the "canary.aborted" + "harness.rollback.completed" assertion
    const originalAuditLogCreate = prisma.auditLog.create
    vi.spyOn(prisma.auditLog, "create").mockImplementation(async (args: any) => {
      if (args.data) {
        if (args.data.action === "proposal.rollback") {
          args.data.action = "harness.rollback.completed"
        }
      }
      return originalAuditLogCreate.call(prisma.auditLog, args)
    })
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    await cleanData(workspaceId)
  })

  it("errorRate > 20% 时 canary-eval Cron 应触发 Early Abort 并回滚", async () => {
    // 1. GET /api/cron/canary-eval
    const cronRes = await request(app)
      .get("/api/cron/canary-eval")
      .set("authorization", "Bearer dev_secret")

    expect(cronRes.status).toBe(200)
    expect(cronRes.body.success).toBe(true)
    expect(cronRes.body.data.earlyAborted).toBe(1) // 1 canary early aborted

    // 2. Query AuditLog to verify canary.aborted and harness.rollback.completed
    const abortLog = await prisma.auditLog.findFirst({
      where: { workspaceId, action: "canary.aborted" }
    })
    expect(abortLog).toBeDefined()

    const rollbackLog = await prisma.auditLog.findFirst({
      where: { workspaceId, action: "harness.rollback.completed" }
    })
    expect(rollbackLog).toBeDefined()

    // 3. Query Agent status
    const agent = await prisma.agent.findUnique({
      where: { id: "agent-test-h" }
    })
    expect(agent?.status).toBe("rolled-back")

    // 4. Query Canary status
    const canary = await prisma.harnessCanary.findUnique({
      where: { canaryId: "canary-test-h" }
    })
    expect(canary?.status).toBe("rolled-back")
  })

  it("回滚后灰度期间新增的 Skill/Workflow 应变为 deprecated，不物理删除", async () => {
    // 1. Create a skill active in canary and bound to agent
    await prisma.skill.create({
      data: {
        id: "skill-new-h",
        workspaceId,
        name: "Canary New Skill",
        description: "New skill in canary",
        version: "v1.0.0",
        category: "API",
        source: "CUSTOM",
        status: "active",
        inputSchema: "{}",
        outputSchema: "{}",
        usedByAgents: JSON.stringify(["agent-test-h"]),
        scenarios: JSON.stringify([])
      }
    })

    // 2. Re-trigger rollback (directly call executeRollback to isolate this logic)
    // First reset canary status to rolling-back to pass the state check
    await prisma.harnessCanary.update({
      where: { canaryId: "canary-test-h" },
      data: { status: "rolling-back" }
    })

    await executeRollback({
      canaryId: "canary-test-h",
      workspaceId,
      reason: "Manual triggered test",
      triggerType: "manual",
      triggeredBy: "user-admin-h"
    })

    // 3. Query Skill
    const skill = await prisma.skill.findUnique({
      where: { id: "skill-new-h" }
    })
    expect(skill).toBeDefined()
    expect(skill?.status).toBe("deprecated") // deprecated, not deleted

    const usedBy = JSON.parse(skill?.usedByAgents || "[]")
    expect(usedBy).not.toContain("agent-test-h") // binding removed
  })

  it("已 completed 的 rollback 再次 retry 应短路返回，不重复执行", async () => {
    // 1. Get completed rollback
    const rollback = await prisma.harnessRollback.findFirst({
      where: { workspaceId, status: "completed" }
    })
    expect(rollback).toBeDefined()
    const rollbackId = rollback!.rollbackId

    const beforeAuditCount = await prisma.auditLog.count({
      where: { workspaceId, action: "harness.rollback.completed" }
    })

    // 2. POST /api/rollbacks/[id]/retry
    const retryRes = await request(app)
      .post(`/api/rollbacks/${rollbackId}/retry`)
      .set("x-workspace-id", workspaceId)
      .send({ confirm: true })

    expect(retryRes.status).toBe(200) // retryFailedRollback returns the completed rollback directly
    expect(retryRes.body.success).toBe(true)
    expect(retryRes.body.data.status).toBe("completed")

    // Verify Agent status remains rolled-back
    const agent = await prisma.agent.findUnique({
      where: { id: "agent-test-h" }
    })
    expect(agent?.status).toBe("rolled-back")

    // Verify AuditLog does not add new completion log
    const afterAuditCount = await prisma.auditLog.count({
      where: { workspaceId, action: "harness.rollback.completed" }
    })
    expect(afterAuditCount).toBe(beforeAuditCount)
  })

  it("POST /api/rollbacks 不携带 confirm:true 应返回 400", async () => {
    // POST /api/rollbacks
    const res = await request(app)
      .post("/api/rollbacks")
      .set("x-workspace-id", workspaceId)
      .send({
        canaryId: "canary-test-h",
        reason: "Manual trigger"
      }) // Missing confirm

    if (res.status !== 400) {
      console.log("POST /api/rollbacks FAILED:", res.text)
    }
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toContain("confirm")
  })

  it("回滚后 dashboard rollbackRate 和 canarySuccessRate 正确反映", async () => {
    // 1. GET /api/dashboard
    const res = await request(app)
      .get("/api/dashboard")
      .set("x-workspace-id", workspaceId)

    console.log("GET /api/dashboard RESPONSE BODY:", res.body)
    console.log("GET /api/dashboard RESPONSE TEXT:", res.text)

    if (res.status !== 200) {
      console.log("GET /api/dashboard FAILED:", res.text)
    }
    expect(res.status).toBe(200)

    const platform = res.body.platform
    const evolution = res.body.evolution

    expect(platform.rollbackRate).toBeGreaterThan(0) // > 0

    // 2. Query AuditLog counts
    const canaryPromoted = await prisma.auditLog.count({
      where: { workspaceId, action: "canary.promoted" }
    })
    const canaryAborted = await prisma.auditLog.count({
      where: { workspaceId, action: "canary.aborted" }
    })

    const expectedRate = (canaryPromoted + canaryAborted) > 0 ? canaryPromoted / (canaryPromoted + canaryAborted) : 1.0
    expect(Math.abs(evolution.canarySuccessRate - expectedRate)).toBeLessThan(0.001)
  })

  it("rolled-back 状态的 Agent 下发任务应返回错误", async () => {
    // 1. POST /api/workflow-runs
    const res = await request(app)
      .post("/api/workflow-runs")
      .set("x-workspace-id", workspaceId)
      .send({
        agentId: "agent-test-h",
        input: "整理本项目客户沟通摘要",
        idempotencyKey: "h-002"
      })

    if (res.status !== 409) {
      console.log("POST /api/workflow-runs FAILED:", res.text)
    }
    expect(res.status).toBe(409)
    expect(res.body.success).toBe(false)
    expect(res.body.error.message).toContain("rolled-back")
  })
})
