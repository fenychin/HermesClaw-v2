'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 text-center">
      <div className="w-12 h-12 bg-danger/15 rounded-xl flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-danger" />
      </div>
      <h2 className="font-semibold text-foreground mb-1">页面加载失败</h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-xs">
        {error.message || '页面遇到了错误，请尝试重新加载'}
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        重新加载
      </button>
    </div>
  );
}
