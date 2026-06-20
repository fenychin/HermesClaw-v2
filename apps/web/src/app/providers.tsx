"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * 全局客户端 Providers：
 * - SessionProvider：Auth.js 会话上下文
 * - TanStack Query：统一管理服务端状态（缓存、失效、重试）
 * - TooltipProvider：shadcn Tooltip 全局上下文
 */
export function Providers({ children }: { children: ReactNode }) {
  // 惰性初始化，确保每个客户端实例仅创建一个 QueryClient（避免 SSR 间共享）
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000, // 缓存保留 5 分钟（跨页面导航复用，减少重复请求）
            refetchOnWindowFocus: false,
            refetchOnMount: (query) => {
              // 已有数据的查询不自动重新拉取（staleTime 控制刷新时机）
              return query.state.data === undefined;
            },
          },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delay={200}>{children}</TooltipProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
