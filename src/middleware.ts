/**
 * Next.js Edge Middleware
 * —— 认证拦截 + 粗粒度写保护
 * —— 从 JWT session cookie 解码用户角色，未认证的写操作返回 401
 * —— 不对静态资源、public 文件和系统路由执行
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 需跳过的路径前缀 */
const SKIP_PREFIXES = [
  "/_next/",
  "/static/",
  "/favicon.ico",
  "/api/auth/",
  "/api/health",
];

/** 系统级路由（无需 session 的 cron / webhook） */
const SYSTEM_ROUTES = [
  "/api/maintenance/",
  "/api/harness/cron",
];

/** 开发环境免认证路由（仅本地测试使用） */
const DEV_BYPASS_ROUTES = ["/api/chat", "/api/task", "/api/conversations"];

/** 写操作方法 */
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * 从 JWT session token 中提取 role 字段
 * —— 在 Edge Runtime 中运行，无 Prisma 依赖，纯 Base64URL 解码
 */
function getRoleFromSessionToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    return (parsed.role as string) ?? null;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 仅处理 API 路由
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // 跳过认证、健康检查和系统路由
  for (const prefix of SKIP_PREFIXES) {
    if (pathname.startsWith(prefix)) return NextResponse.next();
  }
  for (const prefix of SYSTEM_ROUTES) {
    if (pathname.startsWith(prefix)) return NextResponse.next();
  }

  // 开发环境免认证：DEV_BYPASS_AUTH=true 时放行 chat/task API
  if (
    process.env.DEV_BYPASS_AUTH === "true" &&
    DEV_BYPASS_ROUTES.some((route) => pathname.startsWith(route))
  ) {
    return NextResponse.next();
  }

  // 写操作：要求有效 session，VIEWER 角色拦截
  if (WRITE_METHODS.includes(request.method)) {
    const sessionToken =
      request.cookies.get("authjs.session-token")?.value ??
      request.cookies.get("__Secure-authjs.session-token")?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { success: false, error: "未登录，写操作需要认证" },
        { status: 401 },
      );
    }

    const role = getRoleFromSessionToken(sessionToken);
    if (role === "VIEWER") {
      return NextResponse.json(
        { success: false, error: "VIEWER 角色不可执行写操作" },
        { status: 403 },
      );
    }
  }

  return NextResponse.next();
}

/** 匹配所有非静态路径 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
