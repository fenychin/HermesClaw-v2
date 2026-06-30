/**
 * API 路由测试：/api/marketing/early-access
 * 直接测试 Route Handler，不启动服务器
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST, GET } from "@/app/api/marketing/early-access/route"
import { NextRequest } from "next/server"

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/marketing/early-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe("POST /api/marketing/early-access", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {})
  })

  it("valid email returns 201 { ok: true }", async () => {
    const req = createRequest({ email: "test@company.com" })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.ok).toBe(true)
  })

  it("invalid email returns 422", async () => {
    const req = createRequest({ email: "not-an-email" })
    const res = await POST(req)
    expect(res.status).toBe(422)
  })

  it("malformed JSON returns 400", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/marketing/early-access",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{{{",
      },
    )
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("missing email field returns 422", async () => {
    const req = createRequest({})
    const res = await POST(req)
    expect(res.status).toBe(422)
  })

  it("GET request returns 405", async () => {
    const res = await GET()
    expect(res.status).toBe(405)
  })
})
