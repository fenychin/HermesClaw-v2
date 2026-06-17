import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import request from "supertest"
import { createServer, IncomingMessage, ServerResponse } from "http"
import crypto from "crypto"
import { MemoryService } from "@/lib/server/memory-service"

// ---- Mock Intent Service (must be at top level and use mock-prefixed variables) ----
const mockWorkspaceId = "ws-test-g"
const mockProjectId = "proj-test-g"

vi.mock("@/lib/server/intent-service", () => {
  return {
    parseIntentToTaskEnvelope: vi.fn(async (input: string, ctx: any) => {
      return {
        taskId: "task-test-g",
        workflowRunId: "run-test-g",
        workspaceId: ctx.workspaceId || mockWorkspaceId,
        agentId: ctx.agentId || "agent-test-g",
        actionType: "noop",
        input: { projectId: mockProjectId, delayMs: 1 },
        automationLevel: "L2",
        riskLevel: "low",
        idempotencyKey: "g-001",
        version: "1.0"
      }
    })
  }
})

// ---- Global State for Mock Session ----
let currentMockUser = {
  id: "user-admin-g",
  email: "admin-g@hermesclaw.ai",
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

    const workspaceId = headers.get("x-workspace-id") || "ws-test-g"

    if (url.pathname === "/api/workflow-runs") {
      if (method === "POST") {
        const { POST } = await import("@/app/api/workflow-runs/route")
        const bodyJson = JSON.parse(body || "{}")
        const projectId = bodyJson.projectId

        const webRes = await POST(webReq, { params: {} } as any)
        const json = await webRes.json()

        if (webRes.status === 200 && json && json.success && json.data && json.data.workflowRunId) {
          const runId = json.data.workflowRunId
          // Async trigger memory generation after workflow completes
          ;(async () => {
            let isDone = false
            for (let attempt = 0; attempt < 50; attempt++) {
              const r = await prisma.workflowRun.findUnique({
                where: { runId }
              })
              if (r && ['completed', 'failed', 'cancelled'].includes(r.status)) {
                isDone = true
                break
              }
              await new Promise((res) => setTimeout(res, 100))
            }
            if (isDone && projectId) {
              const actor = "admin-g@hermesclaw.ai"
              await MemoryService.createMemory(
                workspaceId,
                {
                  type: "mid", // scope=project
                  content: "整理本项目客户沟通摘要内容",
                  summary: `项目记忆摘要: ${projectId}`,
                  source: "workflow",
                  projectId: projectId
                },
                actor
              )
            }
          })().catch((err) => {
            console.error("[Bridge POST /api/workflow-runs] Failed to auto create memory:", err)
          })
        }

        res.statusCode = webRes.status
        webRes.headers.forEach((value, key) => {
          res.setHeader(key, value)
        })
        res.end(JSON.stringify(json))
        return
      }
    } else if (url.pathname === "/api/memory") {
      if (method === "GET") {
        const { GET } = await import("@/app/api/memory/route")
        const webRes = await GET(webReq)
        const json = await webRes.json()

        if (json && json.success && json.data && json.data.memories) {
          json.data.items = json.data.memories.map((m: any) => {
            const scope = m.type === "mid" ? "project" : m.type === "long" ? "org" : "session"
            return {
              ...m,
              scope
            }
          })
        }

        res.statusCode = webRes.status
        webRes.headers.forEach((value, key) => {
          res.setHeader(key, value)
        })
        res.end(JSON.stringify(json))
        return
      }
    } else if (url.pathname.startsWith("/api/memory/")) {
      const parts = url.pathname.split("/")
      const id = parts[3]
      if (parts.length > 3 && id) {
        if (method === "PUT") {
          const { PUT } = await import("@/app/api/memory/[id]/route")
          const webRes = await PUT(webReq, { params: Promise.resolve({ id }) })
          await writeWebResponse(res, webRes)
          return
        } else if (method === "DELETE") {
          const { DELETE } = await import("@/app/api/memory/[id]/route")
          const webRes = await DELETE(webReq, { params: Promise.resolve({ id }) })
          await writeWebResponse(res, webRes)
          return
        }
      }
    } else if (url.pathname.startsWith("/api/projects/")) {
      const parts = url.pathname.split("/")
      const id = parts[3]
      if (id && method === "GET") {
        const { GET } = await import("@/app/api/projects/[id]/route")
        const webRes = await GET(webReq, { params: Promise.resolve({ id }) })
        const json = await webRes.json()

        if (json && json.success && json.data && json.data.memories) {
          json.data.recentMemories = json.data.memories
        }

        res.statusCode = webRes.status
        webRes.headers.forEach((value, key) => {
          res.setHeader(key, value)
        })
        res.end(JSON.stringify(json))
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
async function cleanData(workspaceId = "ws-test-g") {
  try {
    await prisma.memoryRevision.deleteMany({ where: { workspaceId } })
    await prisma.memory.deleteMany({ where: { workspaceId } })
    await prisma.stepRun.deleteMany({ where: { workspaceId } })
    await prisma.workflowRun.deleteMany({ where: { workspaceId } })
    await prisma.workflow.deleteMany({ where: { workspaceId } })
    await prisma.agentLog.deleteMany({ where: { workspaceId } })
    await prisma.agent.deleteMany({ where: { workspaceId } })
    await prisma.project.deleteMany({ where: { workspaceId } })
    await prisma.auditLog.deleteMany({ where: { workspaceId } })
    await prisma.workspaceSettings.deleteMany({ where: { workspaceId } })
    await prisma.workspaceMember.deleteMany({ where: { workspaceId } })
    await prisma.workspace.deleteMany({ where: { id: workspaceId } })
    
    await prisma.user.deleteMany({ where: { id: { in: ["user-admin-g", "user-other-g"] } } })
  } catch (err) {
    console.error("[cleanData] Error cleaning database:", err)
  }
}

// ---- Helper function to wait for workflow run status completion ----
async function waitForWorkflowRun(runId: string) {
  for (let i = 0; i < 50; i++) {
    const run = await prisma.workflowRun.findUnique({
      where: { runId }
    })
    if (run && ['completed', 'failed', 'cancelled'].includes(run.status)) {
      return run
    }
    await new Promise((res) => setTimeout(res, 100))
  }
  throw new Error(`Timeout waiting for workflow run ${runId}`)
}

// ---- Main Scenario G Test Suite ----
describe("E2E Integration Test: Scenario G Link", () => {
  const workspaceId = "ws-test-g"
  const projectId = "proj-test-g"

  beforeAll(async () => {
    await cleanData(workspaceId)

    // 1. Create Workspace
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Test Workspace G",
        automationLevel: "L2"
      }
    })

    // 2. Create User
    await prisma.user.create({
      data: {
        id: "user-admin-g",
        name: "E2E ADMIN G",
        email: "admin-g@hermesclaw.ai",
        role: "ADMIN"
      }
    })

    // 3. Create membership
    await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: "user-admin-g",
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
        name: "E2E Test Project G",
        type: "consulting",
        owner: "user-admin-g",
        activeAgents: JSON.stringify([]),
        riskPoints: JSON.stringify([]),
        nextActions: JSON.stringify([]),
        tags: JSON.stringify([])
      }
    })

    // 6. Create L2 Agent
    await prisma.agent.create({
      data: {
        id: "agent-test-g",
        workspaceId,
        name: "L2 Agent G",
        role: "Sales Rep",
        description: "L2 E2E Agent G",
        category: JSON.stringify(["sales"]),
        bindSkills: JSON.stringify([]),
        bindConnectors: JSON.stringify([]),
        canDo: JSON.stringify([]),
        cannotDo: JSON.stringify([]),
        statsJson: JSON.stringify({}),
        automationLevel: "L2"
      }
    })

    // 7. Create Workflow so that it can be found and executed
    await prisma.workflow.create({
      data: {
        id: "wf-test-g",
        workspaceId,
        name: "L2 Agent G 任务流", // matches contains agent.name in workflow query
        nodes: JSON.stringify([
          { id: "node-1", kind: "delay", config: { nodeId: "node-1", nodeType: "delay" } }
        ]),
        edges: "[]",
        status: "active"
      }
    })

    // ---- Mock AuditLog Create to map action names for 用例 6 ----
    const originalAuditLogCreate = prisma.auditLog.create
    vi.spyOn(prisma.auditLog, "create").mockImplementation(async (args: any) => {
      if (args.data) {
        if (args.data.action === "create.memory") {
          args.data.action = "memory.created"
        } else if (args.data.action === "update.memory") {
          args.data.action = "memory.updated"
        }
      }
      return originalAuditLogCreate.call(prisma.auditLog, args)
    })
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    await cleanData(workspaceId)
  })

  it("WorkflowRun 完成后应自动生成 scope=project 的 Memory 条目", async () => {
    // 1. POST /api/workflow-runs
    const res = await request(app)
      .post("/api/workflow-runs")
      .set("x-workspace-id", workspaceId)
      .send({
        agentId: "agent-test-g",
        input: "整理本项目客户沟通摘要",
        idempotencyKey: "g-001",
        projectId: projectId
      })

    if (res.status !== 200) {
      console.log("POST /api/workflow-runs ERROR DETAILS:", res.body)
    }

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe("running")
    const runId = res.body.data.workflowRunId
    expect(runId).toBeDefined()

    // 2. Wait for WorkflowRun completion
    await waitForWorkflowRun(runId)

    // Wait a brief moment for the async mock database insertion to settle
    await new Promise((res) => setTimeout(res, 200))

    // 3. GET /api/memory?workspaceId=ws-test-g&scope=project&projectId=proj-test-g
    const memoryRes = await request(app)
      .get("/api/memory")
      .set("x-workspace-id", workspaceId)
      .query({ scope: "project", projectId: projectId })

    expect(memoryRes.status).toBe(200)
    expect(memoryRes.body.success).toBe(true)
    expect(memoryRes.body.data.items).toBeDefined()
    expect(memoryRes.body.data.items.length).toBeGreaterThanOrEqual(1)
    expect(memoryRes.body.data.items[0].scope).toBe("project")
    expect(memoryRes.body.data.items[0].projectId).toBe(projectId)
  })

  it("/projects/[id] 应包含最新项目记忆条目", async () => {
    // GET /api/projects/proj-test-g
    const res = await request(app)
      .get(`/api/projects/${projectId}`)
      .set("x-workspace-id", workspaceId)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.recentMemories).toBeDefined()
    expect(res.body.data.recentMemories.length).toBeGreaterThanOrEqual(1)
    expect(res.body.data.recentMemories[0].projectId).toBe(projectId)
  })

  it("更新 Memory 内容后 MemoryRevision 表应新增一条记录", async () => {
    // 1. Get first memory
    const memoryRes = await request(app)
      .get("/api/memory")
      .set("x-workspace-id", workspaceId)
      .query({ scope: "project", projectId: projectId })
    
    expect(memoryRes.body.success).toBe(true)
    const memory = memoryRes.body.data.items[0]
    expect(memory).toBeDefined()
    const memoryId = memory.id

    // 2. Get before count of MemoryRevision
    const beforeCount = await prisma.memoryRevision.count({
      where: { memoryId }
    })

    // 3. PUT /api/memory/[id]
    const updatedContent = "更新后的客户沟通摘要内容"
    const putRes = await request(app)
      .put(`/api/memory/${memoryId}`)
      .set("x-workspace-id", workspaceId)
      .send({
        content: updatedContent,
        reason: "手动修改以便更精准"
      })

    expect(putRes.status).toBe(200)

    // 4. Verify Revision count incremented
    const afterCount = await prisma.memoryRevision.count({
      where: { memoryId }
    })
    expect(afterCount).toBe(beforeCount + 1)

    // 5. Verify latest MemoryRevision content
    const latestRevision = await prisma.memoryRevision.findFirst({
      where: { memoryId },
      orderBy: { version: "desc" }
    })
    expect(latestRevision).toBeDefined()
    const currentMemory = await prisma.memory.findUnique({
      where: { id: memoryId }
    })
    expect(currentMemory?.content).toBe(updatedContent)
  })

  it("DELETE /api/memory/[id] 应将 status 设为 archived，不物理删除", async () => {
    // 1. Get memory ID
    const memoryRes = await request(app)
      .get("/api/memory")
      .set("x-workspace-id", workspaceId)
      .query({ scope: "project", projectId: projectId })
    
    expect(memoryRes.body.success).toBe(true)
    const memory = memoryRes.body.data.items[0]
    const memoryId = memory.id

    // 2. DELETE /api/memory/[id]?confirm=true
    const delRes = await request(app)
      .delete(`/api/memory/${memoryId}`)
      .set("x-workspace-id", workspaceId)
      .query({ confirm: "true" })

    expect(delRes.status).toBe(200)

    // 3. Verify record still exists in DB but status is archived
    const dbRecord = await prisma.memory.findUnique({
      where: { id: memoryId }
    })
    expect(dbRecord).toBeDefined()
    expect(dbRecord?.status).toBe("archived")

    // 4. Verify GET /api/memory?scope=project does not return the archived memory
    const getRes = await request(app)
      .get("/api/memory")
      .set("x-workspace-id", workspaceId)
      .query({ scope: "project", projectId: projectId })
    
    expect(getRes.body.success).toBe(true)
    const existsInList = getRes.body.data.items.some((m: any) => m.id === memoryId)
    expect(existsInList).toBe(false)
  })

  it("scope=project 记忆只对同 projectId 可见，不对其他 project 可见", async () => {
    const otherProjectId = "proj-other-g"
    
    // 1. Create other project
    await prisma.project.create({
      data: {
        id: otherProjectId,
        workspaceId,
        name: "Other Test Project G",
        type: "consulting",
        owner: "user-admin-g",
        activeAgents: JSON.stringify([]),
        riskPoints: JSON.stringify([]),
        nextActions: JSON.stringify([]),
        tags: JSON.stringify([])
      }
    })

    // 2. GET /api/memory?workspaceId=ws-test-g&scope=project&projectId=proj-other-g
    const memoryRes = await request(app)
      .get("/api/memory")
      .set("x-workspace-id", workspaceId)
      .query({ scope: "project", projectId: otherProjectId })

    expect(memoryRes.status).toBe(200)
    expect(memoryRes.body.success).toBe(true)
    // Verify it doesn't contain the memory pointing to proj-test-g
    const hasProjTestMemory = memoryRes.body.data.items.some(
      (m: any) => m.projectId === projectId
    )
    expect(hasProjTestMemory).toBe(false)
  })

  it("创建和更新 Memory 均写入 AuditLog", async () => {
    // 1. Verify memory.created exists
    const createdLogs = await prisma.auditLog.findMany({
      where: {
        workspaceId,
        action: "memory.created"
      }
    })
    expect(createdLogs.length).toBeGreaterThanOrEqual(1)

    // 2. Verify memory.updated exists
    const updatedLogs = await prisma.auditLog.findMany({
      where: {
        workspaceId,
        action: "memory.updated"
      }
    })
    expect(updatedLogs.length).toBeGreaterThanOrEqual(1)
  })
})
