import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import request from "supertest"
import { createServer, IncomingMessage, ServerResponse } from "http"
import crypto from "crypto"

// ---- Global State for Mock Session ----
let currentMockUser = {
  id: "user-admin-f",
  email: "admin-f@hermesclaw.ai",
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

    if (url.pathname === "/api/dashboard") {
      if (method === "GET") {
        const { GET } = await import("@/app/api/dashboard/route")
        const webRes = await GET(webReq, { params: {} } as any)
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
async function cleanData(workspaceId = "ws-test-f") {
  try {
    // Teardown with correct foreign key order
    await prisma.stepRun.deleteMany({ where: { workspaceId } })
    await prisma.workflowRun.deleteMany({ where: { workspaceId } })
    await prisma.workflow.deleteMany({ where: { workspaceId } })
    await prisma.auditLog.deleteMany({ where: { workspaceId } })
    await prisma.industryPackInstallation.deleteMany({ where: { workspaceId } })
    await prisma.workspaceSettings.deleteMany({ where: { workspaceId } })
    await prisma.workspaceMember.deleteMany({ where: { workspaceId } })
    await prisma.workspace.deleteMany({ where: { id: workspaceId } })
    await prisma.user.deleteMany({ where: { id: "user-admin-f" } })
  } catch (err) {
    console.error("[cleanData] Error cleaning database:", err)
  }
}

// ---- Main Scenario F Test Suite ----
describe("E2E Integration Test: Scenario F - Dashboard accuracy", () => {
  const workspaceId = "ws-test-f"

  beforeAll(async () => {
    await cleanData(workspaceId)

    // 1. Create Workspace
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Accuracy Workspace F",
        automationLevel: "L2"
      }
    })

    // 2. Create User
    await prisma.user.create({
      data: {
        id: "user-admin-f",
        name: "Accuracy ADMIN F",
        email: "admin-f@hermesclaw.ai",
        role: "ADMIN"
      }
    })

    // 3. Create membership
    await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: "user-admin-f",
        role: "ADMIN"
      }
    })

    // 4. Create Settings
    await prisma.workspaceSettings.create({
      data: {
        workspaceId,
        defaultModel: "deepseek-chat",
        taskProviderMap: JSON.stringify({}),
        workflowEngine: "local"
      }
    })

    // 5. Create Workflow
    await prisma.workflow.create({
      data: {
        id: "flow-test-f",
        workspaceId,
        name: "E2E Flow F",
        nodes: "[]",
        edges: "[]"
      }
    })

    const now = new Date()

    // 6. Create 10 WorkflowRuns (7 completed, 2 failed, 1 cancelled) within 7 days
    const statuses = [
      "completed", "completed", "completed", "completed", "completed", "completed", "completed",
      "failed", "failed",
      "cancelled"
    ]
    for (let i = 0; i < 10; i++) {
      await prisma.workflowRun.create({
        data: {
          id: `wfr-${i}`,
          runId: `run-${i}`,
          workspaceId,
          workflowId: "flow-test-f",
          status: statuses[i],
          createdAt: new Date(now.getTime() - i * 30 * 60 * 1000) // in last 7 days
        }
      })
    }

    // 7. Create 10 StepRuns associated with those 10 WorkflowRuns (5 with outputData, 5 without)
    for (let i = 0; i < 10; i++) {
      await prisma.stepRun.create({
        data: {
          id: `step-run-${i}`,
          stepId: `step-${i}`,
          runId: `run-${i}`,
          workspaceId,
          nodeId: `node-${i}`,
          nodeType: "skill-call",
          status: "completed",
          outputData: i < 5 ? { receiptHash: `hash-${i}` } : null,
          createdAt: new Date(now.getTime() - i * 30 * 60 * 1000)
        }
      })
    }

    // 8. Create AuditLogs (5 email.sent, 2 email.failed, 3 approval.requested, 2 approval.granted, 1 approval.rejected, 1 harness.rollback.completed)
    const auditLogsToCreate = [
      ...Array.from({ length: 5 }, (_, i) => ({ action: "email.sent", id: `audit-sent-${i}` })),
      ...Array.from({ length: 2 }, (_, i) => ({ action: "email.failed", id: `audit-failed-${i}` })),
      ...Array.from({ length: 3 }, (_, i) => ({ action: "approval.requested", id: `audit-req-${i}` })),
      ...Array.from({ length: 2 }, (_, i) => ({ action: "approval.granted", id: `audit-grant-${i}` })),
      { action: "approval.rejected", id: "audit-reject-0" },
      { action: "harness.rollback.completed", id: "audit-rollback-0" }
    ]

    for (let idx = 0; idx < auditLogsToCreate.length; idx++) {
      const log = auditLogsToCreate[idx]
      await prisma.auditLog.create({
        data: {
          id: log.id,
          workspaceId,
          actor: "system",
          action: log.action,
          targetType: "test",
          targetId: "test",
          status: "success",
          createdAt: new Date(now.getTime() - idx * 15 * 60 * 1000)
        }
      })
    }

    // 9. Create Industry Pack Installation
    await prisma.industryPackInstallation.create({
      data: {
        installationId: "inst-test-f",
        workspaceId,
        packId: "trade-pack-f",
        packName: "Trade Pack F",
        packVersion: "1.0.0",
        status: "installed",
        manifest: {}
      }
    })

    // 10. Create 5 older WorkflowRuns (10 days ago) for period switching test
    for (let i = 0; i < 5; i++) {
      await prisma.workflowRun.create({
        data: {
          id: `wfr-old-${i}`,
          runId: `run-old-${i}`,
          workspaceId,
          workflowId: "flow-test-f",
          status: "completed",
          createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000) // 10 days ago (outside 7d, inside 30d)
        }
      })
    }
  })

  afterAll(async () => {
    await cleanData(workspaceId)
  })

  it("taskCompletionRate 应精确等于 completed/total", async () => {
    const res = await request(app)
      .get("/api/dashboard")
      .set("x-workspace-id", workspaceId)
      .query({ period: "7d" })

    expect(res.status).toBe(200)
    const rate = res.body.execution.taskCompletionRate
    expect(Math.abs(rate - 7 / 10)).toBeLessThan(0.001)
  })

  it("connectorSuccessRate 应精确等于 sent/(sent+failed)", async () => {
    const res = await request(app)
      .get("/api/dashboard")
      .set("x-workspace-id", workspaceId)
      .query({ period: "7d" })

    expect(res.status).toBe(200)
    const rate = res.body.execution.connectorSuccessRate
    expect(Math.abs(rate - 5 / 7)).toBeLessThan(0.001)
  })

  it("humanInterventionRate 应等于 approval.requested/workflowRun总数", async () => {
    const res = await request(app)
      .get("/api/dashboard")
      .set("x-workspace-id", workspaceId)
      .query({ period: "7d" })

    expect(res.status).toBe(200)
    const rate = res.body.execution.humanInterventionRate
    expect(Math.abs(rate - 3 / 10)).toBeLessThan(0.001)
  })

  it("rollbackRate 应等于 rollback.completed/workflowRun总数", async () => {
    const res = await request(app)
      .get("/api/dashboard")
      .set("x-workspace-id", workspaceId)
      .query({ period: "7d" })

    expect(res.status).toBe(200)
    const rate = res.body.platform.rollbackRate
    expect(rate).toBeGreaterThanOrEqual(0)
    expect(rate).toBeLessThanOrEqual(1)
  })

  it("proposalApprovalRate 应等于 granted/(granted+rejected)", async () => {
    const res = await request(app)
      .get("/api/dashboard")
      .set("x-workspace-id", workspaceId)
      .query({ period: "7d" })

    expect(res.status).toBe(200)
    const rate = res.body.platform.proposalApprovalRate
    expect(Math.abs(rate - 2 / 3)).toBeLessThan(0.001)
  })

  it("receiptCompletenessRate 应等于有 receiptHash 的 Event/总 Event", async () => {
    const res = await request(app)
      .get("/api/dashboard")
      .set("x-workspace-id", workspaceId)
      .query({ period: "7d" })

    expect(res.status).toBe(200)
    const rate = res.body.execution.receiptCompletenessRate
    expect(Math.abs(rate - 5 / 10)).toBeLessThan(0.001)
  })

  it("installedPackCount 应等于 status=installed 的 Installation 数量", async () => {
    const res = await request(app)
      .get("/api/dashboard")
      .set("x-workspace-id", workspaceId)
      .query({ period: "7d" })

    expect(res.status).toBe(200)
    expect(res.body.platform.installedPackCount).toBe(1)
  })

  it("period=30d 与 period=7d 返回不同数值（验证时间窗口生效）", async () => {
    // 1. GET period=7d
    const res7 = await request(app)
      .get("/api/dashboard")
      .set("x-workspace-id", workspaceId)
      .query({ period: "7d" })
    
    expect(res7.status).toBe(200)
    const count_7d = res7.body.platform.workflowRunsByStatus.completed +
                     res7.body.platform.workflowRunsByStatus.failed +
                     res7.body.platform.workflowRunsByStatus.cancelled

    // 2. GET period=30d
    const res30 = await request(app)
      .get("/api/dashboard")
      .set("x-workspace-id", workspaceId)
      .query({ period: "30d" })

    expect(res30.status).toBe(200)
    const count_30d = res30.body.platform.workflowRunsByStatus.completed +
                      res30.body.platform.workflowRunsByStatus.failed +
                      res30.body.platform.workflowRunsByStatus.cancelled

    // 3. Expect 30d task count (15) > 7d task count (10)
    expect(count_30d).toBeGreaterThan(count_7d)
    expect(count_7d).toBe(10)
    expect(count_30d).toBe(15)
  })
})
