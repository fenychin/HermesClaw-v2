'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 生产环境上报错误（后续接入监控服务）
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <html lang="zh-CN" className="dark">
      <body className="bg-background text-foreground min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-16 h-16 bg-danger/15 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-danger" />
          </div>
          <h1 className="text-2xl font-bold mb-2">出现了一点问题</h1>
          <p className="text-muted-foreground text-sm mb-8">
            系统遇到了意外错误。你的数据是安全的，请尝试刷新页面。
            {error.digest && (
              <span className="block mt-2 font-mono text-xs text-hint">
                错误码: {error.digest}
              </span>
            )}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={reset}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              重试
            </button>
            <Link
              href="/workspace/chat"
              className="flex items-center gap-2 bg-accent hover:bg-accent/80 text-foreground px-4 py-2 rounded-xl text-sm transition-colors"
            >
              <Home className="w-4 h-4" />
              回到首页
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
