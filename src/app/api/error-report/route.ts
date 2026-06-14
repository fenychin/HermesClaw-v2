import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { z } from "zod"

/** 前端错误上报请求体 schema（所有字段可选，宽松接收） */
const ErrorReportSchema = z.object({
  message: z.string().optional(),
  stack: z.string().optional(),
  url: z.string().optional(),
  userAgent: z.string().optional(),
  componentStack: z.string().optional(),
})

/**
 * POST /api/error-report
 * 接收前端错误上报，记录到结构化日志
 * —— 始终返回 200，避免前端重试或陷入错误循环
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = ErrorReportSchema.safeParse(raw);

    if (parsed.success) {
      logger.error('前端错误上报', {
        source: 'client',
        message: parsed.data.message,
        stack: parsed.data.stack?.slice(0, 1000),
        url: parsed.data.url,
        userAgent: parsed.data.userAgent,
        componentStack: parsed.data.componentStack,
      });
    } else {
      // schema 校验失败（字段类型不符），仍尽力记录
      logger.error('前端错误上报（校验失败，尽力记录）', {
        source: 'client',
        message: raw?.message,
        stack: typeof raw?.stack === "string" ? raw.stack.slice(0, 1000) : undefined,
        url: raw?.url,
        validationErrors: parsed.error.issues,
      });
    }

    return Response.json({ ok: true });
  } catch {
    // 即使解析失败也返回 200，前端不做重试
    return Response.json({ ok: false, reason: 'invalid payload' });
  }
}
