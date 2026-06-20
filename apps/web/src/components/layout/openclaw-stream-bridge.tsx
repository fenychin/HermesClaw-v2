"use client";

import { useOpenClawStream } from "@/hooks/use-openclaw-stream";

/**
 * 仅负责挂载 OpenClaw SSE 订阅，不参与工作台布局渲染。
 * 这样 SSE 状态变化不会拖动 AppShell 整体重渲染。
 */
export function OpenClawStreamBridge() {
  useOpenClawStream();
  return null;
}
