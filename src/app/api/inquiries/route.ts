/**
 * @deprecated 自 v0.12.12 起，外贸专属 API 收敛到 /api/packs/foreign-trade/* 命名空间。
 * 本文件保留 308 永久重定向作为兼容层；计划在 v0.13 删除。
 *
 * 迁移依据：CLAUDE.md §6.1（行业包是插件，不是业务分支）+ 全局架构审查 P0-#1。
 */
import { NextResponse } from "next/server"

const NEW_PREFIX = "/api/packs/foreign-trade/inquiries"
const OLD_PREFIX = "/api/inquiries"

function redirect(req: Request) {
  const url = new URL(req.url)
  url.pathname = url.pathname.replace(OLD_PREFIX, NEW_PREFIX)
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
export const POST = redirect
