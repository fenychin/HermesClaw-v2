import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * API Route Handler 类型
 * 支持标准 Next.js App Router handler 签名
 */
type Handler = (
  req: NextRequest,
  context?: { params: Record<string, string> },
) => Promise<Response>;

/**
 * withErrorHandler — 统一 API 错误处理高阶函数
 *
 * 包裹所有 API route handler，提供：
 * - 请求日志（开始 / 完成 / 失败，含耗时）
 * - 一致的错误响应格式
 * - Prisma / 数据库错误友好提示
 * - 生产环境脱敏（不暴露内部错误详情）
 * - 结构化的错误日志输出
 *
 * 用法：
 *   export const GET = withErrorHandler(async (req) => { ... })
 *   export const POST = withErrorHandler(async (req) => { ... })
 */
export function withErrorHandler(handler: Handler): Handler {
  return async (req, context) => {
    const start = Date.now();
    const method = req.method;
    const url = new URL(req.url).pathname;

    logger.info('API 请求开始', { method, url });

    try {
      const response = await handler(req, context);
      const duration = Date.now() - start;
      logger.info('API 请求完成', { method, url, status: response.status, duration });
      return response;
    } catch (error) {
      const duration = Date.now() - start;
      const message = error instanceof Error ? error.message : '未知错误';
      const isProd = process.env['NODE_ENV'] === 'production';

      logger.error('API 请求失败', { method, url, duration, error: message });

      // 区分常见数据库 / 运行时错误，返回对应 HTTP 状态码
      if (message.includes('Record to delete does not exist')) {
        return NextResponse.json({ error: '记录不存在' }, { status: 404 });
      }
      if (message.includes('Record to update not found')) {
        return NextResponse.json({ error: '记录不存在' }, { status: 404 });
      }
      if (message.includes('Unique constraint failed')) {
        return NextResponse.json(
          { error: '数据已存在，请勿重复创建' },
          { status: 409 },
        );
      }
      if (message.includes('Foreign key constraint failed')) {
        return NextResponse.json(
          { error: '关联数据不存在，请检查引用' },
          { status: 400 },
        );
      }
      if (message.includes('缺少必需的环境变量')) {
        return NextResponse.json(
          { error: '服务器配置错误，请联系管理员' },
          { status: 503 },
        );
      }

      // Zod / 校验错误
      if (message.includes('校验失败') || message.includes('ZodError')) {
        return NextResponse.json(
          { error: isProd ? '请求参数不合法' : message },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { error: isProd ? '服务器内部错误' : message },
        { status: 500 },
      );
    }
  };
}

/**
 * formatApiError — 便捷函数，在 handler 内手动抛出结构化错误
 *
 * 用法：
 *   if (!user) throw formatApiError('用户不存在', 404)
 */
export function formatApiError(message: string, status: number) {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}
