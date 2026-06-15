/**
 * GET /api/fetch-meta?url=...
 * —— 抓取目标 URL 的页面标题与描述（服务端代理，避免 CORS）
 */
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // 频率限制：每分钟最多 30 次
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(ip, 30, 60_000)) {
    return Response.json(
      { error: "请求过于频繁，请稍后重试" },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return Response.json({ error: "缺少 url 参数" }, { status: 400 });
  }

  // 仅允许 http/https
  if (!/^https?:\/\//i.test(url)) {
    return Response.json({ error: "仅支持 http/https URL" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "HermesClaw/1.0 (URL Metadata Fetcher)",
        Accept: "text/html",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return Response.json({ title: url });
    }

    const html = await res.text();
    // 提取 <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || undefined;

    // 提取 <meta name="description">
    const descMatch = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    );
    const description = descMatch?.[1]?.trim() || undefined;

    return Response.json({ title, description });
  } catch (error) {
    logger.warn("fetch-meta: 抓取失败", {
      url,
      error: error instanceof Error ? error.message : "未知错误",
    });
    // 失败时返回 URL 本身，不阻断用户流程
    return Response.json({ title: url });
  }
}
