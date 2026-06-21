/**
 * API Mock 辅助工具
 * —— 用于单元测试中模拟 fetch / next-auth / prisma 等依赖
 */
import { vi } from "vitest";

/** 创建 fetch mock，返回指定的 JSON 响应 */
export function mockFetchResponse(status: number, data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

/** Mock Next.js headers() 函数 */
export function mockHeaders(cookieValue?: string) {
  const headers = new Map<string, string>();
  if (cookieValue) {
    headers.set("cookie", cookieValue);
  }
  return {
    get: (name: string) => headers.get(name) ?? null,
    set: (name: string, value: string) => headers.set(name, value),
    forEach: (fn: (value: string, key: string) => void) => headers.forEach(fn),
  };
}

/** 生成模拟的 Auth.js Session Cookie（JWT 格式） */
export function createMockSessionToken(payload: Record<string, unknown> = {}) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(
    JSON.stringify({
      sub: payload.sub || "test-user-id",
      email: payload.email || "test@hermesclaw.ai",
      name: payload.name || "Test User",
      role: payload.role || "member",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...payload,
    })
  );
  const signature = btoa("mock-signature");
  return `authjs.session-token=${header}.${body}.${signature}`;
}

/** Mock Prisma 查询结果 */
export function mockPrismaFind(result: unknown = null) {
  return { findUnique: vi.fn().mockResolvedValue(result), findFirst: vi.fn().mockResolvedValue(result) };
}
