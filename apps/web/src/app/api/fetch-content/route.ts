import { logger } from "@/lib/logger"; import { rateLimit } from "@/lib/rate-limit"
export const runtime = "nodejs"
export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown"
  if (!rateLimit(ip, 15, 60_000)) return Response.json({ error: "请求过于频繁" }, { status: 429 })
  const { searchParams } = new URL(request.url); const url = searchParams.get("url")
  if (!url) return Response.json({ error: "缺少 url 参数" }, { status: 400 })
  if (!/^https?:\/\//i.test(url)) return Response.json({ error: "仅支持 http/https URL" }, { status: 400 })
  const maxChars = Math.min(Math.max(Number(searchParams.get("maxChars") || "8000"), 100), 50000)
  try {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "HermesClaw/1.0", Accept: "text/html, application/xhtml+xml" } }); clearTimeout(timeout)
    if (!res.ok) return Response.json({ content: `[无法访问此 URL，HTTP ${res.status}]`, title: url })
    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) return Response.json({ content: `[非 HTML 内容（${contentType}）]`, title: url })
    const html = await res.text(); const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i); const title = titleMatch?.[1]?.trim() || url
    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi," ").replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi," ").replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi," ").replace(/<head[^>]*>[\s\S]*?<\/head>/gi," ").replace(/<!--[\s\S]*?-->/g," ").replace(/<\/?(div|p|h[1-6]|li|tr|article|section|header|footer|main|aside|nav|table|ul|ol|dl|blockquote|pre|figure|figcaption|details|summary|fieldset|form|hr|br)[^>]*>/gi,"\n").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").replace(/^[ \n]+/gm,"").trim()
    return Response.json({ title, content: text.length > maxChars ? text.slice(0, maxChars) + `\n\n…(已截断)` : text })
  } catch (error) { logger.warn("fetch-content: 抓取失败", { url, error: error instanceof Error ? error.message : "未知错误" }); return Response.json({ content: `[无法访问此 URL]`, title: url }) }
}
