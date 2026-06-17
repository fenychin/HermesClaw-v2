'use client';

interface ErrorReport {
  message: string;
  stack?: string;
  url: string;
  userAgent: string;
  timestamp: string;
  componentStack?: string;
}

/**
 * 前端错误上报
 * - 开发环境仅 console 输出，不做网络请求
 * - 生产环境通过 keepalive 上报到 /api/error-report（即使用户正在离开页面）
 */
export async function reportError(error: Error, componentStack?: string) {
  if (process.env['NODE_ENV'] === 'development') {
    console.error('[Error Reporter]', error);
    return;
  }

  const report: ErrorReport = {
    message: error.message,
    stack: error.stack,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    componentStack,
  };

  try {
    await fetch('/api/error-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
    });
  } catch {
    // 上报失败不抛出错误，避免陷入无限错误循环
  }
}
