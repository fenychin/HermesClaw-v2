/**
 * @deprecated 自 v0.12.12 起，外贸 health 端点收敛到 /api/packs/foreign-trade/health。
 * 本文件保留 308 永久重定向作为兼容层；计划在 v0.13 删除。
 */
import { NextResponse } from "next/server"

const NEW_PATH = "/api/packs/foreign-trade/health"
const OLD_PATH = "/api/foreign-trade/health"

function redirect(req: Request) {
  const url = new URL(req.url)
  url.pathname = url.pathname.replace(OLD_PATH, NEW_PATH)
  return NextResponse.redirect(url, {
    status: 308,
    headers: {
      Deprecation: "true",
      Sunset: "v0.13",
      Link: `<${url.pathname}>; rel="successor-version"`,
    },
  })
}

export const GET = redirect
