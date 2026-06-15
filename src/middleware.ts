/**
 * Next.js Edge Middleware（全站唯一入口）
 * —— 页面路由：未登录重定向 /login（页面级认证门禁）
 * —— API 路由：写操作要求有效 session + VIEWER 角色拦截（粗粒度写保护）
 * —— 关键约束：API 路由永不重定向到 /login（否则前端数据请求会被 307 打断）
 * —— 从 JWT session cookie 解码用户角色，纯 Base64URL 解码，无 Prisma 依赖
 *
 * 注：本文件是项目唯一 middleware。历史上根目录另有一份 middleware.ts 仅做页面门禁，
 * 与本文件冲突（Next 仅加载一个，webpack/Turbopack 各取其一导致行为不一致），现已合并删除。
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 需跳过的路径前缀（静态资源 / 认证回调 / 健康检查） */
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
const DEV_BYPASS_ROUTES = [
  "/api/chat",
  "/api/task",
  "/api/conversations",
  // Phase 2 主链路冒烟：dispatch / openclaw events / harness evaluate-event
  // —— 仅 DEV_BYPASS_AUTH=true 时放行；route handler 内部仍有自己的 token / RBAC 兜底
  "/api/openclaw/events",
  "/api/openclaw/checkin",
  "/api/harness/evaluate-event",
];

/** 写操作方法 */
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/** 公开页面（无需登录即可访问） */
const PUBLIC_PAGES = ["/login"];

/** 从请求 cookie 中读取 session token（兼容开发 / 生产 cookie 名） */
function getSessionToken(request: NextRequest): string | undefined {
  return (
    request.cookies.get("authjs.session-token")?.value ??
    request.cookies.get("__Secure-authjs.session-token")?.value
  );
}

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
  } catch (err) {
    // E6 修复：至少 log 一次，生产排查"角色未知→401"能定位到 JWT 层
    console.warn("[middleware] JWT role 解码失败，降级为无角色", {
      tokenPrefix: token.slice(0, 10) + "...",
      error: err instanceof Error ? err.message : String(err),
    })
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳过静态资源、认证回调与健康检查
  for (const prefix of SKIP_PREFIXES) {
    if (pathname.startsWith(prefix)) return NextResponse.next();
  }

  // ============================================================
  // API 路由：写操作认证 + 角色门禁（永不重定向到 /login）
  // ============================================================
  if (pathname.startsWith("/api/")) {
    // 系统级 cron / webhook 放行
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
      const sessionToken = getSessionToken(request);
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

  // ============================================================
  // 页面路由：未登录重定向 /login
  // ============================================================
  const isPublic = PUBLIC_PAGES.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`),
  );
  if (isPublic) return NextResponse.next();

  if (!getSessionToken(request)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

/** 匹配所有非静态路径 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
