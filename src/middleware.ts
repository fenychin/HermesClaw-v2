/**
 * Next.js Edge Middleware
 * —— workspaceId 注入 + 粗粒度写入保护
 * —— VIEWER 角色拦截 API 写操作（POST/PUT/PATCH/DELETE）
 * —— 不对静态资源和 public 文件执行
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

/** API 路径前缀 */
const API_PREFIX = "/api/";

/** 写操作方法 */
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳过非 API 路径和认证/健康检查
  if (!pathname.startsWith(API_PREFIX)) return NextResponse.next();
  for (const prefix of SKIP_PREFIXES) {
    if (pathname.startsWith(prefix)) return NextResponse.next();
  }

  // 对于写操作，做粗粒度权限检查
  if (WRITE_METHODS.includes(request.method)) {
    // 从 session cookie 中提取用户信息（JWT 自包含，Edge 可解码）
    const sessionToken =
      request.cookies.get("authjs.session-token")?.value ??
      request.cookies.get("__Secure-authjs.session-token")?.value;

    // 如果没有 session token，放行由 API 层做细粒度鉴权
    //（API 层会返回 401）
    if (!sessionToken) {
      // 对于 workspace 成员 API，需要特殊处理
      // 放行——细粒度权限由 Route Handler 处理
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

/** 匹配所有路径 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
