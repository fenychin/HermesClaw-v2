import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { buildWorkspaceContext } from "@/lib/workspace"

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

// mock buildWorkspaceContext
vi.mock("@/lib/workspace", () => ({
  buildWorkspaceContext: vi.fn(),
  hasMinRole: (role: string, reqRole: string) => {
    const roles = ["VIEWER", "MEMBER", "ADMIN", "OWNER"]
    return roles.indexOf(role) >= roles.indexOf(reqRole)
  }
}))

// mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}))

// mock audit helper
vi.mock("@/lib/server/shared/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue({}),
  actorFromSession: vi.fn().mockResolvedValue("member@hermesclaw.ai"),
}))

describe("GET /api/industry/[packId]/capabilities API 路由测试", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("当角色是 MEMBER 时放行并正确返回能力", async () => {
    vi.mocked(buildWorkspaceContext).mockResolvedValue({
      workspaceId: "ws-test",
      role: "MEMBER",
      userId: "u-test",
    })

    const req = new Request("http://localhost/api/industry/foreign-trade/capabilities")
    const routeCtx = { params: Promise.resolve({ packId: "foreign-trade" }) }
    const res = await GET(req, routeCtx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.workflows).toBeDefined()
    expect(body.workflows.some((w: any) => w.id === "inquiry-grade")).toBe(true)
    expect(body.agents).toBeDefined()
    expect(body.agents.some((a: any) => a.id === "agent-001")).toBe(true)
  })

  it("当角色是 VIEWER 时拦截并返回 403 错误", async () => {
    vi.mocked(buildWorkspaceContext).mockResolvedValue({
      workspaceId: "ws-test",
      role: "VIEWER",
      userId: "u-test",
    })

    const req = new Request("http://localhost/api/industry/foreign-trade/capabilities")
    const routeCtx = { params: Promise.resolve({ packId: "foreign-trade" }) }
    const res = await GET(req, routeCtx)
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.error).toBe("RBAC_DENIED")
  })

  it("当 packId 不合法时抛出 500（由于安全字符拦截）", async () => {
    vi.mocked(buildWorkspaceContext).mockResolvedValue({
      workspaceId: "ws-test",
      role: "MEMBER",
      userId: "u-test",
    })

    const req = new Request("http://localhost/api/industry/../../../capabilities")
    const routeCtx = { params: Promise.resolve({ packId: "../../../" }) }
    const res = await GET(req, routeCtx)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toContain("Invalid packId format")
  })

  it("当获取不存在的包时返回 404", async () => {
    vi.mocked(buildWorkspaceContext).mockResolvedValue({
      workspaceId: "ws-test",
      role: "MEMBER",
      userId: "u-test",
    })

    const req = new Request("http://localhost/api/industry/non-existent/capabilities")
    const routeCtx = { params: Promise.resolve({ packId: "non-existent" }) }
    const res = await GET(req, routeCtx)
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toContain("not found")
  })
})
