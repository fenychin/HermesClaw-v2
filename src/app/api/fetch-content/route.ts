/**
 * GET /api/fetch-content?url=...&maxChars=8000
 * —— 抓取目标 URL 的全文可读内容（服务端代理，供 LLM 分析使用）
 *
 * 与 /api/fetch-meta（仅标题/描述）互补，本端点提取页面的完整文本正文，
 * 去除 HTML 标签、脚本、样式后返回纯文本。
 */
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** 默认最大返回字符数 */
const DEFAULT_MAX_CHARS = 8000;
/** 绝对上限 */
const ABSOLUTE_MAX_CHARS = 50000;

export async function GET(request: Request) {
  // 频率限制：每分钟最多 15 次（内容抓取比元数据抓取更重）
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(ip, 15, 60_000)) {
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

  if (!/^https?:\/\//i.test(url)) {
    return Response.json({ error: "仅支持 http/https URL" }, { status: 400 });
  }

  // 解析 maxChars 参数
  const maxCharsParam = searchParams.get("maxChars");
  const maxChars = maxCharsParam
    ? Math.min(Math.max(Number(maxCharsParam), 100), ABSOLUTE_MAX_CHARS)
    : DEFAULT_MAX_CHARS;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "HermesClaw/1.0 (Content Fetcher; +https://github.com/fenychin/HermesClaw-v2)",
        Accept: "text/html, application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return Response.json({
        content: `[无法访问此 URL，HTTP ${res.status}]`,
        title: url,
      });
    }

    const contentType = res.headers.get("content-type") || "";
    // 非 HTML 内容（如 PDF、图片）—— 仅返回类型说明
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return Response.json({
        content: `[此 URL 返回非 HTML 内容（${contentType}），无法提取文本]`,
        title: url,
      });
    }

    const html = await res.text();

    // 提取 <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || url;

    // 提取正文文本：移除 script / style / noscript / iframe / svg
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, " ")
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, " ")
      // 移除 HTML 注释
      .replace(/<!--[\s\S]*?-->/g, " ")
      // 将块级元素替换为换行
      .replace(/<\/?(div|p|h[1-6]|li|tr|article|section|header|footer|main|aside|nav|table|ul|ol|dl|blockquote|pre|figure|figcaption|details|summary|fieldset|form|hr|br)[^>]*>/gi, "\n")
      // 移除其余所有 HTML 标签
      .replace(/<[^>]+>/g, " ")
      // 解码常见 HTML 实体
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      // 合并连续空白/换行
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^[ \n]+/gm, "")
      .trim();

    // 截断到 maxChars
    const truncated = text.length > maxChars
      ? text.slice(0, maxChars) + `\n\n…(内容已截断，原始长度 ${text.length} 字符)`
      : text;

    return Response.json({ title, content: truncated });
  } catch (error) {
    logger.warn("fetch-content: 抓取失败", {
      url,
      error: error instanceof Error ? error.message : "未知错误",
    });
    return Response.json({
      content: `[无法访问此 URL${error instanceof Error && error.name === "AbortError" ? "，请求超时" : ""}]`,
      title: url,
    });
  }
}
