import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockFindMany = vi.fn()
const mockPromote = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    harnessProposal: { findMany: (...args: any[]) => mockFindMany(...args) },
  },
}))

vi.mock("@hermesclaw/hermes-kernel", () => ({
  promoteCanaryToActive: (...args: any[]) => mockPromote(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/harness/cron canary check", () => {
  it("works with no canary proposals", async () => {
    mockFindMany.mockResolvedValue([])
    const req = new Request("http://localhost/api/harness/cron")
    const res = await GET(req as any)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.checked).toBe(0)
    expect(body.data.promoted).toBe(0)
    expect(body.data.rolledBack).toBe(0)
  })

  it("promotes a passed canary", async () => {
    mockFindMany.mockResolvedValue([
      { id: "p1", proposalId: "HEP-001", workspaceId: "ws-1", canaryStartedAt: new Date(), canaryWindowHours: 72 },
    ])
    mockPromote.mockResolvedValue({ ok: true, outcome: "promoted", message: "passed" })

    const req = new Request("http://localhost/api/harness/cron")
    const res = await GET(req as any)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.checked).toBe(1)
    expect(body.data.promoted).toBe(1)
    expect(body.data.rolledBack).toBe(0)
    expect(mockPromote).toHaveBeenCalledWith(
      { proposalId: "p1", workspaceId: "ws-1", actor: "cron" },
      expect.any(Object),
    )
  })

  it("rolls back a failed canary", async () => {
    mockFindMany.mockResolvedValue([
      { id: "p2", proposalId: "HEP-002", workspaceId: "ws-1", canaryStartedAt: new Date(), canaryWindowHours: 72 },
    ])
    mockPromote.mockResolvedValue({ ok: true, outcome: "rolled-back", message: "failed" })

    const req = new Request("http://localhost/api/harness/cron")
    const res = await GET(req as any)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.rolledBack).toBe(1)
    expect(body.data.promoted).toBe(0)
  })

  it("skips pending canaries", async () => {
    mockFindMany.mockResolvedValue([
      { id: "p3", proposalId: "HEP-003", workspaceId: "ws-1", canaryStartedAt: new Date(), canaryWindowHours: 72 },
    ])
    mockPromote.mockResolvedValue({ ok: true, outcome: "pending", message: "still in window" })

    const req = new Request("http://localhost/api/harness/cron")
    const res = await GET(req as any)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.pending).toBe(1)
  })

  it("rejects unauthorized requests when CRON_SECRET is set", async () => {
    const prev = process.env.CRON_SECRET
    process.env.CRON_SECRET = "my-secret"
    const req = new Request("http://localhost/api/harness/cron")
    const res = await GET(req as any)
    expect(res.status).toBe(401)
    process.env.CRON_SECRET = prev
  })
})
