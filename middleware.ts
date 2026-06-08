import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get("authjs.session-token")?.value;

  const response = sessionToken
    ? NextResponse.next()
    : NextResponse.redirect(new URL("/login", request.url));

  // 添加调试头
  response.headers.set("X-Middleware-Debug", `path=${pathname}, hasSession=${!!sessionToken}`);
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
