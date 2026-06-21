"use client";

import { useEffect } from "react";
import { useSessionStore } from "@/stores/session-store";
import type { ExecutionEvent } from "@hermesclaw/event-contracts";

export function useExecutionEvents(taskId: string | null) {
  const appendEvent = useSessionStore((s) => s.actions.appendEvent);

  useEffect(() => {
    if (!taskId) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3000";
    const ws = new WebSocket(`${wsUrl}/ws/tasks/${taskId}/events`);

    ws.onmessage = (msg) => {
      const event: ExecutionEvent = JSON.parse(msg.data);
      // ✅ 只写入 store，不做任何业务判断与重试策略决策
      appendEvent(event);
    };

    ws.onerror = (err) => {
      console.error("WS error", err);
    };

    return () => {
      ws.close();
    };
  }, [taskId, appendEvent]);
}
