import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import request from "supertest"
import { createServer, IncomingMessage, ServerResponse } from "http"
import crypto from "crypto"
import * as emailConnector from "@/lib/server/connectors/email-connector"
import * as modelRouter from "@/lib/server/model-router"

// ---- Mock email-connector sendSmtp to skip real network ----
vi.mock("@/lib/server/connectors/email-connector", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/connectors/email-connector")>()
  return {
    ...actual,
    sendSmtpNative: async () => {
      return { messageId: `<mock-${crypto.randomUUID()}@hermesclaw.ai>` }
    }
  }
})

// ---- Mock LLM Provider & Intent Parsing ----
const mockLLMResult = {
  subject: "E2E Development Email Subject",
  body: "E2E Development Email Body Content"
}
vi.mock("@/lib/server/llm-provider", () => {
  return {
    DEFAULT_ANTHROPIC_MODEL: "claude-sonnet-4-6",
    DEFAULT_DEEPSEEK_MODEL: "deepseek-chat",
    isProviderAvailable: vi.fn(() => true),
    callAnthropicStructured: vi.fn(async () => mockLLMResult),
    callDeepSeekJson: vi.fn(async () => mockLLMResult)
  }
})

// ---- Global State for Mock Sessions & Tracking IDs ----
let currentMockUser = {
  id: "user-admin-d",
  email: "admin-d@hermesclaw.ai",
  role: "ADMIN"
}

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

    if (url.pathname.startsWith("/api/inquiries/") && url.pathname.endsWith("/generate-email")) {
      const parts = url.pathname.split("/")
      const id = parts[3]
      if (method === "POST") {
        const { POST } = await import("@/app/api/inquiries/[id]/generate-email/route")
        const webRes = await POST(webReq, { params: Promise.resolve({ id }) })
        await writeWebResponse(res, webRes)
        return
      }
    } else if (url.pathname.startsWith("/api/inquiries/") && url.pathname.endsWith("/send-email")) {
      const parts = url.pathname.split("/")
      const id = parts[3]
      if (method === "POST") {
        const bodyJson = JSON.parse(body || "{}")
        const { sendEmail } = await import("@/lib/server/connectors/email-connector")
        
        try {
          const workspaceId = headers.get("x-workspace-id") || "ws-test-d"
          const sendResult = await sendEmail({
            connectorId: "built-in.email",
            workspaceId,
            from: { address: "system@hermesclaw.ai" },
            to: Array.isArray(bodyJson.to) 
              ? bodyJson.to.map((addr: string) => ({ address: addr }))
              : typeof bodyJson.to === "string" 
                ? [{ address: bodyJson.to }] 
                : [],
            subject: bodyJson.subject || "No Subject",
            bodyHtml: bodyJson.body || "No Body",
            leaseToken: bodyJson.leaseToken,
            agentId: "agent-test-d",
            taskId: "task-test-d"
          })
          if (sendResult.status === 'failed') {
            throw new Error(`Email sendResult status is failed: ${sendResult.errorMessage || 'unknown'}`)
          }
          res.statusCode = 200
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ success: true, data: sendResult }))
        } catch (err: any) {
          res.setHeader("Content-Type", "application/json")
          if (err.name === 'LeaseTokenValidationError' || err.message.includes('leaseToken') || err.message.includes('LeaseToken')) {
            res.statusCode = 403
            res.end(JSON.stringify({ success: false, error: err.name, message: err.message }))
          } else {
            res.statusCode = 400
            res.end(JSON.stringify({ success: false, error: err.name || 'Error', message: err.message }))
          }
        }
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

// ---- Data Cleanup Helpers ----
async function cleanData(workspaceId = "ws-test-d") {
  try {
    await prisma.connector.deleteMany({ where: { workspaceId } })
    await prisma.emailSendLog.deleteMany({ where: { workspaceId } })
    await prisma.inquiry.deleteMany({ where: { workspaceId } })
    await prisma.auditLog.deleteMany({ where: { workspaceId } })
    await prisma.workspaceSettings.deleteMany({ where: { workspaceId } })
    await prisma.workspaceMember.deleteMany({ where: { workspaceId } })
    await prisma.agent.deleteMany({ where: { workspaceId } })
    await prisma.workspace.deleteMany({ where: { id: workspaceId } })
    
    await prisma.user.deleteMany({ where: { id: { in: ["user-admin-d", "user-viewer-d"] } } })
  } catch (err) {
    console.error("[cleanData] Error cleaning database:", err)
  }
}

// ---- Main Scenario D Test Suite ----
describe("E2E Integration Test: Scenario D Link", () => {
  const workspaceId = "ws-test-d"
  const inquiryId = "inq-test-d"

  beforeAll(async () => {
    await cleanData(workspaceId)

    // 1. Create Workspace
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Test Workspace D",
        automationLevel: "L2"
      }
    })

    // 2. Create Users
    await prisma.user.createMany({
      data: [
        {
          id: "user-admin-d",
          name: "E2E ADMIN D",
          email: "admin-d@hermesclaw.ai",
          role: "ADMIN"
        }
      ]
    })

    // 3. Create memberships
    await prisma.workspaceMember.createMany({
      data: [
        {
          workspaceId,
          userId: "user-admin-d",
          role: "ADMIN"
        }
      ]
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

    // 5. Create Inquiry
    await prisma.inquiry.create({
      data: {
        id: inquiryId,
        workspaceId,
        fromCountry: "United States",
        countryFlag: "🇺🇸",
        companyName: "USA Buyer Corp",
        summary: "询求高品质太阳能电池板产品，数量约 5000 片。",
        priority: "high",
        channel: "email",
        receivedAt: new Date()
      }
    })

    // 6. Create Email Connector
    await prisma.connector.create({
      data: {
        id: "built-in.email",
        workspaceId,
        name: "Built-in Email",
        iconEmoji: "📧",
        description: "Built-in SMTP Connector",
        status: "available",
        category: "communication",
        permissions: JSON.stringify([]),
        usedByAgents: JSON.stringify([]),
        config: {
          host: "smtp.example.com",
          port: 465,
          secure: true,
          auth: {
            user: "smtp-user",
            pass: "smtp-pass"
          }
        }
      }
    })

    // Configure session as ADMIN
    currentMockUser = {
      id: "user-admin-d",
      email: "admin-d@hermesclaw.ai",
      role: "ADMIN"
    }
  })

  afterAll(async () => {
    await cleanData(workspaceId)
  })

  it("POST /api/inquiries/[id]/generate-email 应返回 subject 和 body", async () => {
    const spyModel = vi.spyOn(modelRouter, "selectModel").mockResolvedValue({
      provider: "deepseek",
      model: "deepseek-chat",
      estimatedTokens: 1000,
      degraded: false
    })

    const res = await request(app)
      .post(`/api/inquiries/${inquiryId}/generate-email`)
      .set("x-workspace-id", workspaceId)
      .send({
        style: "formal",
        language: "en"
      })

    expect(res.status).toBe(200)
    expect(res.body.data.subject).toBe(mockLLMResult.subject)
    expect(res.body.data.body).toBe(mockLLMResult.body)
    expect(res.body.data.version).toBe(1)

    spyModel.mockRestore()
  })

  it("邮件发送后必须写入 email.sent AuditLog，且不含邮件正文", async () => {
    const res = await request(app)
      .post(`/api/inquiries/${inquiryId}/send-email`)
      .set("x-workspace-id", workspaceId)
      .send({
        subject: mockLLMResult.subject,
        body: mockLLMResult.body,
        to: "test@example.com"
      })

    expect(res.status).toBe(200)

    // Check AuditLog contains email.sent
    const logs = await prisma.auditLog.findMany({
      where: {
        workspaceId,
        action: "email.sent"
      }
    })
    expect(logs.length).toBeGreaterThanOrEqual(1)

    // Assert AuditLog does not contain bodyHtml or bodyText
    logs.forEach(log => {
      const snapStr = JSON.stringify(log.contextSnapshot || {})
      expect(snapStr).not.toContain(mockLLMResult.body)
      expect(log.detail).not.toContain(mockLLMResult.body)
    })
  })

  it("AuditLog 和 EmailSendLog 中不得包含 bodyText/bodyHtml", async () => {
    // 1. Verify EmailSendLog does not contain bodyText or bodyHtml fields (they must be null in schema/logs)
    const emailLogs = await prisma.emailSendLog.findMany({
      where: { workspaceId }
    })
    expect(emailLogs.length).toBeGreaterThanOrEqual(1)
    
    emailLogs.forEach((log: any) => {
      expect(log.bodyText).toBeUndefined()
      expect(log.bodyHtml).toBeUndefined()
    })

    // 2. Verify AuditLog does not leak email body
    const execLogs = await prisma.auditLog.findMany({
      where: {
        workspaceId,
        action: "email.sent"
      }
    })
    
    execLogs.forEach(log => {
      const snapStr = JSON.stringify(log.contextSnapshot || {})
      expect(snapStr).not.toContain(mockLLMResult.body)
    })
  })

  it("email.sent 后 connectorSuccessRate 分子应增加", async () => {
    // 1. Record before count of email.sent from DB (numerator of success rate)
    const beforeCount = await prisma.auditLog.count({
      where: {
        workspaceId,
        action: "email.sent"
      }
    })

    // 2. Send 3 success emails
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post(`/api/inquiries/${inquiryId}/send-email`)
        .set("x-workspace-id", workspaceId)
        .send({
          subject: mockLLMResult.subject,
          body: mockLLMResult.body,
          to: `test-${i}@example.com`
        })
      expect(res.status).toBe(200)
    }

    // 3. Query Dashboard
    const dashboardRes = await request(app)
      .get("/api/dashboard")
      .set("x-workspace-id", workspaceId)
      .query({ period: "7d" })

    expect(dashboardRes.status).toBe(200)

    // 4. Assert DB numerator increased by 3
    const afterCount = await prisma.auditLog.count({
      where: {
        workspaceId,
        action: "email.sent"
      }
    })
    expect(afterCount).toBeGreaterThanOrEqual(beforeCount + 3)
  })

  it("to > 10 收件人无 leaseToken 应被拒绝", async () => {
    // 11 recipients
    const toRecipients = Array.from({ length: 11 }, (_, i) => `client-${i}@example.com`)

    const res = await request(app)
      .post(`/api/inquiries/${inquiryId}/send-email`)
      .set("x-workspace-id", workspaceId)
      .send({
        subject: mockLLMResult.subject,
        body: mockLLMResult.body,
        to: toRecipients
      })

    expect(res.status).toBe(403)
    expect(res.body.error).toContain("LeaseTokenValidationError")

    // Assert no success log was written
    const lastLogs = await prisma.auditLog.findMany({
      where: {
        workspaceId,
        action: "email.sent",
        detail: { contains: "client-10@example.com" }
      }
    })
    expect(lastLogs.length).toBe(0)
  })
})
