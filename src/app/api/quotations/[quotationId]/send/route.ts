/**
 * @deprecated 自 v0.12.14 起，外贸专属 API 收敛到 /api/packs/foreign-trade/* 命名空间。
 * 本文件保留 308 永久重定向作为兼容层。
 */
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ quotationId: string }> },
) {
  const { quotationId } = await params
  const url = new URL(req.url)
  url.pathname = `/api/packs/foreign-trade/quotations/${quotationId}/send`
  return NextResponse.redirect(url, {
    status: 308,
    headers: {
      Deprecation: "true",
      Sunset: "v0.13",
      Link: `<${url.pathname}>; rel="successor-version"`,
    },
  })
}
