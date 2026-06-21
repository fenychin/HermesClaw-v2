"use client";

import { useState, useEffect, useCallback } from "react";

interface FetchResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function useBrainFetch<T>(
  fetchFn: (workspaceId: string) => Promise<FetchResponse<T>>,
  workspaceId: string = "default"
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    let active = true;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchFn(workspaceId);
      if (active) {
        if (res.success && res.data !== undefined) {
          setData(res.data);
        } else {
          throw new Error(res.error || "数据获取失败，响应状态异常");
        }
      }
    } catch (err) {
      if (active) {
        setError(err instanceof Error ? err.message : "未知数据获取错误");
      }
    } finally {
      if (active) {
        setLoading(false);
      }
    }
    return () => {
      active = false;
    };
  }, [fetchFn, workspaceId]);

  useEffect(() => {
    const cleanup = loadData();
    return () => {
      // 解决异步清理
      cleanup.then((fn) => fn && fn());
    };
  }, [loadData]);

  return { data, loading, error, refetch: loadData };
}
