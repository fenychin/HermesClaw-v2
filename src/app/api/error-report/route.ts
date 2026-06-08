import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * POST /api/error-report
 * 接收前端错误上报，记录到结构化日志
 * —— 始终返回 200，避免前端重试或陷入错误循环
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    logger.error('前端错误上报', {
      source: 'client',
      message: body.message,
      stack: body.stack?.slice(0, 1000), // 截断，避免日志过大
      url: body.url,
      userAgent: body.userAgent,
      componentStack: body.componentStack,
    });

    return Response.json({ ok: true });
  } catch {
    // 即使解析失败也返回 200，前端不做重试
    return Response.json({ ok: false, reason: 'invalid payload' });
  }
}
