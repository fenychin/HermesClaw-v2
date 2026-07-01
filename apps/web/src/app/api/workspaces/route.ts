// @deprecated: use /api/workspace instead
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/api/workspace", request.url), { status: 301 });
}
