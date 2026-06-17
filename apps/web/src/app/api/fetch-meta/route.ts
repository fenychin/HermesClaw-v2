import { logger } from "@/lib/logger"; import { rateLimit } from "@/lib/rate-limit"
export const runtime = "nodejs"
export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown"
  if (!rateLimit(ip, 30, 60_000)) return Response.json({ error: "请求过于频繁" }, { status: 429 })
  const { searchParams } = new URL(request.url); const url = searchParams.get("url")
  if (!url) return Response.json({ error: "缺少 url 参数" }, { status: 400 })
  if (!/^https?:\/\//i.test(url)) return Response.json({ error: "仅支持 http/https URL" }, { status: 400 })
  try {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "HermesClaw/1.0", Accept: "text/html" } }); clearTimeout(timeout)
    if (!res.ok) return Response.json({ title: url })
    const html = await res.text(); const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i); const title = titleMatch?.[1]?.trim() || undefined
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i); const description = descMatch?.[1]?.trim() || undefined
    return Response.json({ title, description })
  } catch (error) { logger.warn("fetch-meta: 抓取失败", { url, error: error instanceof Error ? error.message : "未知错误" }); return Response.json({ title: url }) }
}
