"use client";

/**
 * 大盘实时流 Hook
 * —— 订阅 /api/dashboard/realtime SSE 事件流，自动刷新 TanStack Query 缓存。
 * —— 连接失败时自动降级为 polling（refetchInterval），保证数据及时性。
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { parseSSEStream } from "@/lib/sse-parser";
import type { DashboardEvent } from "@/lib/server/adapters/dashboard/event-emitter";

export interface UseDashboardStreamOptions {
  /** 工作空间 ID */
  workspaceId?: string;
  /** 是否启用（默认 true） */
  enabled?: boolean;
  /** polling 降级间隔（毫秒），默认 30s */
  pollIntervalMs?: number;
}

/** SSE 原始事件结构 */
interface SSERawEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface UseDashboardStreamReturn {
  /** SSE 连接状态 */
  connected: boolean;
  /** 最近事件 */
  lastEvent: DashboardEvent | null;
  /** 最近告警（最多 10 条） */
  recentAlerts: DashboardEvent[];
}

/**
 * 大盘实时数据流 Hook
 *
 * 使用示例：
 *   const { connected, lastEvent, recentAlerts } = useDashboardStream()
 *   // connected → 右上角绿色脉冲指示器
 *   // recentAlerts → toast 通知渲染
 */
export function useDashboardStream(
  options: UseDashboardStreamOptions = {},
): UseDashboardStreamReturn {
  const { workspaceId = "default", enabled = true, pollIntervalMs = 30_000 } = options;

  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<DashboardEvent | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<DashboardEvent[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 清理所有定时器 */
  const cleanupTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  /** 启动 polling 降级 */
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    pollTimerRef.current = setInterval(() => {
      if (mountedRef.current) {
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats", workspaceId] });
      }
    }, pollIntervalMs);
  }, [queryClient, workspaceId, pollIntervalMs]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) return;

    const connect = () => {
      if (abortRef.current) return;

      const controller = new AbortController();
      abortRef.current = controller;

      const params = new URLSearchParams();
      if (workspaceId) params.set("workspaceId", workspaceId);
      const qs = params.toString();

      fetch(`/api/dashboard/realtime${qs ? `?${qs}` : ""}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok || !response.body) {
            throw new Error(`SSE 连接失败: ${response.status}`);
          }

          if (mountedRef.current) setConnected(true);

          // 清除 polling，SSE 已就绪
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }

          const reader = response.body.getReader();
          await parseSSEStream(reader, {
            doneMarker: null,
            onData: (data) => {
              const event = data as SSERawEvent;
              if (event.type === "heartbeat") return;

              const dashboardEvent: DashboardEvent = {
                type: event.type as DashboardEvent["type"],
                payload: event.payload,
                timestamp: event.timestamp,
              };

              if (mountedRef.current) {
                setLastEvent(dashboardEvent);

                // 告警事件收集
                if (event.type === "dashboard:alert") {
                  setRecentAlerts((prev) =>
                    [dashboardEvent, ...prev].slice(0, 10),
                  );
                }

                // 任何数据变更事件 → 刷新 TanStack Query 缓存
                queryClient.invalidateQueries({
                  queryKey: ["dashboard-stats", workspaceId],
                });
              }
            },
          });
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") return;
          console.warn("[useDashboardStream] SSE 连接失败，降级为 polling", err);
        })
        .finally(() => {
          if (mountedRef.current) setConnected(false);
          abortRef.current = null;

          // SSE 断开后启动 polling 降级
          if (mountedRef.current) {
            startPolling();
          }

          // 30s 后尝试重连 SSE
          if (mountedRef.current && enabled) {
            reconnectTimerRef.current = setTimeout(() => {
              if (mountedRef.current) connect();
            }, 30_000);
          }
        });
    };

    // 初始连接
    connect();

    // 启动 polling 作为初始降级（SSE 连接成功后会清除）
    startPolling();

    return () => {
      mountedRef.current = false;
      cleanupTimers();
    };
  }, [enabled, workspaceId, queryClient, startPolling, cleanupTimers]);

  return { connected, lastEvent, recentAlerts };
}
